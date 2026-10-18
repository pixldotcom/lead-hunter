import {it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {QuickSearch} from './QuickSearch';
it('offers direct search and manual import guidance without provider setup or API controls',()=>{const html=renderToStaticMarkup(createElement(QuickSearch));expect(html).toContain('Search with Google');expect(html).toContain('Search with Bing');expect(html).toContain('Paste and save website URLs');for(const removed of ['Brave','BRAVE_SEARCH_API_KEY','Automatic search needs setup','Find Prospects','Request ceiling','Search result limit'])expect(html).not.toContain(removed)});
