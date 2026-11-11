// Optional synthetic login for the existing isolated workflow smoke tests.
export async function authenticateWorkspace({evaluate,input,click,wait}){
 await wait("!!document.querySelector('.private-login input')||!!document.querySelector('.quick-search')");
 if(!await evaluate("!!document.querySelector('.private-login input')"))return;
 const username=process.env.PIXLDOT_TEST_USERNAME,password=process.env.PIXLDOT_TEST_PASSWORD;
 if(!username||!password)throw Error('Set PIXLDOT_TEST_USERNAME and PIXLDOT_TEST_PASSWORD to the isolated server credentials before running browser checks.');
 await input('[name=username]',username);await input('[name=password]',password);await click('Log in');await wait("!!document.querySelector('.quick-search')");
}
