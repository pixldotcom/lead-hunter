import { describe, expect, it } from 'vitest';
import { isPublicAddress } from './network.ts';
import { parseQuickImport, importBusinessRows } from '../src/quickImport.ts';
import { emptyCloud, validateCloud } from '../src/cloudModel.ts';
import { extractWebsiteDetails } from '../api/import/website.ts';
import { createBusinessRecord } from '../src/opportunityPersistence.ts';

describe('Quick Import', () => {
  it('parses website URLs, Maps references and multi-line manual entries', () => {
    expect(parseQuickImport('https://brightdentist.example/about\nhttps://maps.google.com/maps/place/abc | Bright Dentist | Leeds\nOak Cafe | York | https://oak.example')).toMatchObject([
      { name: 'brightdentist.example', websiteUrl: 'https://brightdentist.example/about' },
      { name: 'Bright Dentist', location: 'Leeds', sourceUrl: 'https://maps.google.com/maps/place/abc' },
      { name: 'Oak Cafe', location: 'York', websiteUrl: 'https://oak.example/' },
    ]);
  });
  it('requires a name and location for Maps references and validates all supplied URLs', () => {
    expect(() => parseQuickImport('https://maps.google.com/maps/place/abc')).toThrow(/business name and location/);
    expect(() => parseQuickImport('Example | Leeds | javascript:alert(1)')).toThrow(/http:\/\/ or https:\/\//);
    expect(() => parseQuickImport(('Name | Place\n').repeat(101))).toThrow(/100 businesses/);
  });
  it('accepts existing validated CSV paste formats', () => {
    expect(parseQuickImport('name,location,website\n"Coffee, Inc.",York,https://coffee.example')).toMatchObject([{name:'Coffee, Inc.',location:'York',websiteUrl:'https://coffee.example'}]);
  });
  it('merges identity duplicates and retains all supplied references', () => {
    const first = parseQuickImport('Clinic | Leeds | https://clinic.example\nClinic | Leeds || https://www.google.com/maps/place/clinic');
    const result = importBusinessRows(first, []);
    expect(result.added).toBe(1);
    expect(result.merged).toBe(1);
    expect(result.businesses).toHaveLength(1);
    expect(result.businesses[0].websiteUrl).toBe('https://clinic.example/');
    expect(result.businesses[0].sourceUrl).toContain('google.com/maps');
  });
  it('merges an OSM business and URL-only Quick Import with the same official website', () => {
    const osm = createBusinessRecord({name:'Lachance Entrepreneur Plombier Inc.',category:'plumber',location:'Sherbrooke',websiteUrl:'https://lachance.qc.ca/',discoverySource:'OpenStreetMap (Photon)',sourceUrl:'https://www.openstreetmap.org/node/123'});
    const result = importBusinessRows(parseQuickImport('https://lachance.qc.ca/'), [osm]);
    expect(result).toMatchObject({added:0,merged:1});
    expect(result.businesses).toHaveLength(1);
    expect(result.businesses[0]).toMatchObject({id:osm.id,name:'Lachance Entrepreneur Plombier Inc.',category:'plumber',location:'Sherbrooke',sourceUrl:osm.sourceUrl});
  });
  it('matches equivalent www, protocol, case and trailing slash URL variants', () => {
    const osm = createBusinessRecord({name:'Lachance Entrepreneur Plombier Inc.',location:'Sherbrooke',websiteUrl:'https://www.lachance.qc.ca/',discoverySource:'OpenStreetMap'});
    const result = importBusinessRows(parseQuickImport('http://LACHANCE.qc.ca'), [osm]);
    expect(result).toMatchObject({added:0,merged:1});
    expect(result.businesses[0].id).toBe(osm.id);
  });
  it('does not merge different website paths on a shared hosting domain', () => {
    const first = createBusinessRecord({name:'Store A',location:'Leeds',websiteUrl:'https://shared.example/store-a',discoverySource:'OSM'});
    const result = importBusinessRows(parseQuickImport('https://shared.example/store-b'), [first]);
    expect(result).toMatchObject({added:1,merged:0});
  });
  it('persists a prospect through the validated workspace model and reload shape', () => {
    const cloud = emptyCloud();
    cloud.discovery.businesses = importBusinessRows(parseQuickImport('Clinic | Leeds'), []).businesses;
    expect(validateCloud(JSON.parse(JSON.stringify(cloud))).discovery.businesses).toMatchObject([{name:'Clinic',location:'Leeds'}]);
  });
  it('merges a Maps reference into an existing website prospect without replacing its website', () => {
    const existing = createBusinessRecord({ name:'Clinic', location:'Leeds', websiteUrl:'https://clinic.example', discoverySource:'Old source' });
    const result = importBusinessRows(parseQuickImport('https://www.google.com/maps/place/Clinic | Clinic | Leeds'), [existing]);
    expect(result.added).toBe(0);
    expect(result.merged).toBe(1);
    expect(result.businesses[0]).toMatchObject({websiteUrl:'https://clinic.example',sourceUrl:'https://www.google.com/maps/place/Clinic',discoverySource:'Old source'});
  });
});

describe('website importer endpoint', () => {
  it('extracts only public page title and description as reviewable suggestions', () => {
    expect(extractWebsiteDetails('<title>Bright Dental | Home</title><meta name="description" content="Appointments available"><meta property="og:site_name" content="Bright Dental">','https://bright.example/')).toMatchObject({name:'Bright Dental',description:'Appointments available',website:'https://bright.example/'});
  });
  it('rejects private network addresses at the existing outbound request boundary', () => {
    expect(isPublicAddress('127.0.0.1')).toBe(false);
    expect(isPublicAddress('10.0.0.2')).toBe(false);
    expect(isPublicAddress('8.8.8.8')).toBe(true);
  });
});
