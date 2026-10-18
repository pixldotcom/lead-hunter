import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ExternalSearch} from './ExternalSearch';
import {defaultSearchOptions,generateQueries} from './searchCatalogue';
describe('external search actions',()=>{
 it('links the generated Unicode and punctuation query to each fixed engine without importing',()=>{const queries=generateQueries({...defaultSearchOptions(),location:'Pune & Mumbai / \u65e5\u672c',keywords:'dentists + dental'});const html=renderToStaticMarkup(createElement(ExternalSearch,{queries}));for(const engine of ['google','bing'])expect(html).toContain(`https://www.${engine}.com/search?q=${encodeURIComponent(queries[0])}`);expect(html.match(/target="_blank"/g)).toHaveLength(2);expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(2);expect(html).toContain('Opening a search does not import results.');expect(html).toContain('Query to search');for(const query of queries)expect(html).toContain(query.replaceAll('&','&amp;'))});
 it('disables actions without a valid generated query',()=>{const html=renderToStaticMarkup(createElement(ExternalSearch,{queries:[]}));expect(html.match(/<button[^>]*disabled/g)).toHaveLength(2);expect(html).not.toContain('target="_blank"');expect(html).toContain('Enter valid search options first')});
});
