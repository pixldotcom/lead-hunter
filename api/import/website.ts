import {productionHandler} from '../../server/production.ts';

// Website import uses the same owner-authenticated, origin-checked boundary as workspace and audit.
export const config={maxDuration:12};
export default productionHandler;
