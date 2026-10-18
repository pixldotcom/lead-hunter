export const TEXT_SCALE_KEY='pixldot-text-scale-v1';
export const TEXT_SCALES=[100,125,150,175] as const;
export type TextScale=typeof TEXT_SCALES[number];
export function readTextScale(storage:Pick<Storage,'getItem'>):TextScale {
 try {const value=Number(storage.getItem(TEXT_SCALE_KEY));return TEXT_SCALES.includes(value as TextScale)?value as TextScale:175}catch{return 175}
}
export function saveTextScale(storage:Pick<Storage,'setItem'>,value:TextScale){
 if(!TEXT_SCALES.includes(value))throw Error('Choose a supported text size.');
 storage.setItem(TEXT_SCALE_KEY,String(value));
}
export function applyTextScale(root:HTMLElement,value:TextScale){root.style.setProperty('--app-text-scale',String(value/100));}
