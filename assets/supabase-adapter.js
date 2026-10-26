(function(){
 let client;
 function getClient(){
  const c=window.ZD_CONFIG||{};
  if(!c.supabaseUrl||!c.supabaseKey||c.supabaseUrl.includes('TU_PROYECTO')||c.supabaseKey.includes('TU_CLAVE'))throw Error('Completa la URL y clave pública en config.js.');
  if(!window.supabase)throw Error('No se pudo cargar Supabase. Revisa tu conexión.');
  if(!client)client=window.supabase.createClient(c.supabaseUrl,c.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  return client;
 }
 async function invoke(action,args=[]){
  const c=getClient(),{data:sessionData,error:sessionError}=await c.auth.getSession();
  if(sessionError||!sessionData.session)throw Error('Sesión vencida. Vuelve a ingresar.');
  const token=sessionData.session.access_token;
  const response=await fetch(window.ZD_CONFIG.supabaseUrl.replace(/\/$/,'')+'/functions/v1/'+(window.ZD_CONFIG.functionName||'zonificacion-api'),{
   method:'POST',headers:{'Content-Type':'application/json','apikey':window.ZD_CONFIG.supabaseKey,'Authorization':'Bearer '+token},body:JSON.stringify({action,args})
  });
  let body;try{body=await response.json();}catch(e){throw Error('Respuesta inválida. Comprueba el despliegue de zonificacion-api.');}
  if(!response.ok)throw Error(body.error||body.message||'No se pudo completar la operación.');
  return body.data;
 }
 window.zdRpc=async(name,...args)=>{
  if(name==='login'){
   const c=getClient(),{error}=await c.auth.signInWithPassword({email:String(args[0]).trim(),password:String(args[1])});
   if(error)throw Error('No se pudo ingresar: '+error.message);
   try{return await invoke('perfil');}catch(e){await c.auth.signOut();throw e;}
  }
  if(name==='logout'){const {error}=await getClient().auth.signOut();if(error)throw error;return true;}
  // La identidad se obtiene exclusivamente del JWT, nunca del token del modelo anterior.
  return invoke(name,args.slice(1));
 };
})();
