import {createSupabaseHandler,supabaseConfig} from './supabaseApp.ts';
let config;try{config=supabaseConfig()}catch{/* Fail closed until the owner configures Supabase. */}
export const productionHandler=createSupabaseHandler(config);
