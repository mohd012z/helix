const valid=x=>x&&typeof x==='object'&&String(x.signal_key??'')&&Number.isInteger(Number(x.message_id))&&Number(x.message_id)>0;

export function createTelegramDeliveryStore(adapter){
 if(typeof adapter?.read!=='function'||typeof adapter?.write!=='function') throw new TypeError('delivery store adapter read/write required');
 return Object.freeze({
  async get(signalKey){
   const key=String(signalKey??''); if(!key) return null;
   const value=await adapter.read(key);
   if(!valid(value)||String(value.signal_key)!==key) return null;
   return Object.freeze({...value,message_id:Number(value.message_id)});
  },
  async persist(record){
   if(!valid(record)) throw new TypeError('valid signal_key and message_id are required');
   const value=Object.freeze({signal_key:String(record.signal_key),message_id:Number(record.message_id),alert_id:String(record.alert_id??''),operation:String(record.operation??'')});
   await adapter.write(value.signal_key,value); return value;
  }
 });
}
