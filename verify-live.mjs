/**
 * Live verification; NO mock or sample character fallback.
 * node verify-live.mjs --status
 * node verify-live.mjs /path/to/selected-photo.jpg
 * U_BASE_URL=https://... APP_ACCESS_TOKEN=... node verify-live.mjs ...
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
const baseURL = (process.env.U_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const token = process.env.APP_ACCESS_TOKEN || '';
const photoPath = process.argv[2];
const mimes = {jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp'};
const headers = token ? {'X-App-Access-Token':token} : {};
const timeout = () => AbortSignal.timeout(12000);
async function jsonCall(route, options = {}) {
  const response = await fetch(baseURL+route, {...options,headers:{...headers,...(options.headers||{})}});
  const obj = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(obj?.error || 'Sunucu hatası: HTTP '+response.status);
  return obj;
}
try {
  const health = await jsonCall('/api/health', {signal:timeout()});
  if (!health.ok) throw new Error('Sunucu hazır değil.');
  const status = await jsonCall('/api/status', {signal:timeout()});
  console.log('Sunucu adresi:', baseURL);
  console.log('Görsel modeli:', status.model);
  console.log('API anahtarı sunucuda TANIMLI:', status.ready?'EVET':'HAYIR');
  console.log('Özel erişim kodu gerekiyor:', status.requiresAccessCode?'EVET':'HAYIR');
  if (!status.ready) throw new Error('OPENAI_API_KEY sunucu ortamında tanımlı değil.');
  if (photoPath === '--status') {
    console.log('Sunucu ayarları hazır görünüyor. GERÇEK ÜRETİM henüz test edilmedi.');
    process.exit(0);
  }
  if (!photoPath) throw new Error('Gerçek test için galeriden seçilen fotoğraf dosyasının yolunu belirt.');
  if (status.requiresAccessCode && !token) throw new Error('APP_ACCESS_TOKEN bu komutun ortamında tanımlanmalı.');
  const ext = path.extname(photoPath).slice(1).toLowerCase();
  const mime = mimes[ext];
  if (!mime) throw new Error('Fotoğraf uzantısı JPG/PNG/WEBP olmalı.');
  const file = await fs.readFile(photoPath);
  if (file.length < 64 || file.length > 8*1024*1024) throw new Error('Fotoğraf geçersiz veya 8 MB sınırının üzerinde.');
  const image = `data:${mime};base64,${file.toString('base64')}`;
  console.log('Gerçek AI üretimi başlatılıyor (örnek yanıt yok; kullanım ücretli olabilir)...');
  const init = await jsonCall('/api/character',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image}),signal:AbortSignal.timeout(20000)});
  if (!/^[a-f0-9]{36}$/.test(init.jobId||'')) throw new Error('Sunucudan iş numarası gelmedi.');
  const id=init.jobId;
  const end=Date.now()+275000;
  while(Date.now()<end) {
    await sleep(2500);
    const state = await jsonCall('/api/jobs/'+id,{signal:timeout()});
    if (state.state==='failed') throw new Error(state.error||'AI üretimi başarısız.');
    if (state.state==='cancelled') throw new Error('AI üretimi iptal edildi.');
    if (state.state==='completed') break;
    if (state.state!=='processing') throw new Error('Beklenmeyen işlem durumu: '+state.state);
  }
  const response=await fetch(baseURL+'/api/jobs/'+id+'/image',{headers,signal:AbortSignal.timeout(30000)});
  if(!response.ok){const obj=await response.json().catch(()=>({}));throw new Error(obj.error||'PNG alınamadı: HTTP '+response.status)}
  if(!response.headers.get('content-type')?.startsWith('image/png'))throw new Error('Görsel PNG değil.');
  const png=Buffer.from(await response.arrayBuffer());
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  if(!png.subarray(0,8).equals(sig)||png.length<64)throw new Error('Yanıt geçerli PNG değil.');
  const width=png.readUInt32BE(16), height=png.readUInt32BE(20);
  if(width<256||height<256)throw new Error('Çıktı çözünürlüğü yetersiz.');
  const output=path.resolve('u-gercek-ai-sonuc.png');
  await fs.writeFile(output,png,{mode:0o600});
  console.log('GERÇEK API ÜRETİMİ TEKNİK OLARAK BAŞARILI.');
  console.log('Boyut:',width+'x'+height,'dosya:',output);
  console.log('SHA-256:',crypto.createHash('sha256').update(png).digest('hex'));
  console.log('İnsan yüzü benzerliği ve stil kalitesi ayrıca görsel olarak değerlendirilmelidir.');
} catch(e) {
  console.error('GERÇEK AI DÖNÜŞÜMÜ DOĞRULANAMADI:',e.message);
  process.exitCode=1;
}
