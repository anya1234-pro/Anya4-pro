# Ü — Gerçek AI dönüşümünü etkinleştirme

## Durum

Kod ve örnek API testleri geçiyor; gerçek üretim henüz aktif değil. Gerçek üretim için OpenAI Platform API hesabı ve HTTPS sunucusu zorunlu. Bu paket örnek/yedek kişi üretmez.

## En kolay, düşük maliyetli kurulum

1. GitHub ve Render hesaplarını bu sohbette bağlantı seçeneklerinden yetkilendir. Bunlar yokken uygulamayı internette otomatik yayımlayamıyorum.
2. https://platform.openai.com/api-keys adresinde kendine ait gizli API anahtarı oluştur, gerekiyorsa API faturalandırmasını etkinleştir. ChatGPT Plus aboneliği API faturasını kapsamaz.
3. GitHub deposuna bu klasörün içeriğini yükle. Render dashboard üzerinde **New → Blueprint** ile o depodaki `render.yaml` dosyasını seç.
4. Render ilk yayın sırasında `OPENAI_API_KEY` ve `APP_ACCESS_TOKEN` değerlerini sorar. Anahtarı sadece Render'ın güvenli alanına yaz. Erişim kodunu kendin belirle (en az 16 karakter), bir parola yöneticisine kaydet; HTML veya depoya yazma.
5. Render'ın verdiği HTTPS adresini Android Chrome'da aç. **Yerel HTML dosyasını açarsan gerçek AI çalışmaz.** Fotoğraf Seç'e basıp fotoğraf seç; üretim başarılıysa alt karakter alanı dolacak.

`render.yaml` test aşaması için `free` planını seçer. Ücretsiz servis 15 dakika boş kalınca kapanır; yeniden açılması yaklaşık bir dakika sürebilir. Kullanım artarsa ücretli plana geçebilirsin. OpenAI API üretimi ayrıca ücretlidir.

## Test ve doğrulama

Sunucu ayağa kalktıktan sonra:

- `https://SİTE_ADRESİN/api/health` → `{"ok":true}`
- `https://SİTE_ADRESİN/api/status` → `ready:true` yalnızca anahtarın *tanımlı* olduğunu gösterir; gerçek üretimi kanıtlamaz.
- Telefonundan galeriden kendi fotoğrafını seç. Bu istek gerçek API üretimi başlatır; ücret doğurabilir. Sonuç doğru PNG olarak gelir ve karakter alanına yerleşirse teknik dönüşüm doğrulanmış olur.

Yerel otomatik kontrol: `npm test`. Bu kontrol **örnek API yanıtı** kullanır, gerçek ücretli AI çağrısı yapmaz.

Komut satırı ile gerçek dönüşüm doğrulaması: `U_BASE_URL=https://SİTE_ADRESİN APP_ACCESS_TOKEN=ERİSİM_KODU node verify-live.mjs secilen-fotograf.jpg`.

## Güvenlik

- `OPENAI_API_KEY` değerini bu sohbete, GitHub'a veya HTML'ye yazma.
- `APP_ACCESS_TOKEN` değerini GitHub'a yazma; gerekirse Render panelinde değiştirebilirsin.
- Seçilen fotoğraflar API'ye gönderilir. Gizlilik bildirimini ve kullanıcıların fotoğraf yüklemeye onayını eklemeden oyunu herkese açma.
- Proje yalnızca bir aktif sunucu örneği için bellek içi iş kuyruğu kullanıyor; yaygın kullanımda kalıcı iş kuyruğu ve kullanıcı başına kimlik doğrulaması gerekir.
