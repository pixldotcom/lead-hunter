import {productionHandler} from '../../server/production.ts';

// Website import uses the same owner-authenticated, origin-checked boundary as workspace and audit.
export {extractWebsiteDetails} from '../../server/websiteImport.ts';
export const config={maxDuration:12};
export default productionHandler;
