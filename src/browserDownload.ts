export function downloadText(content:string,name:string,type='application/json'){
 let url='';
 try{url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();}
 finally{if(url)setTimeout(()=>URL.revokeObjectURL(url),1000)}
}
