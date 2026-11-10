# Ü oyunu — gerçek AI fotoğraf dönüşümü / canlı kurulum

Bu sürüm **eski Ü menü tasarımını aynen korur**. Galeriden seçilen fotoğraf üstte görünür. Alt karakter alanı, başarılı bir gerçek AI üretimi gerçekleşene kadar boştur. Örnek yüz, hazır karakter veya yedek sonuç **gösterilmez**. Fotoğraf kaldırıldığında her iki alan boşalır. Tarayıcıya API anahtarı yazılmaz.

## Şu anda doğrulanan durum

Yerel otomatik testler başarılı: HTML sunumu, fotoğraf kabulü, iki referansın OpenAI Images Edits biçiminde gönderilmesi, üretimin kısa HTTP isteğiyle başlatılması, işlemin durumunun sorgulanması, PNG aktarımı, hatalı erişimin engellenmesi, iptal ve API anahtarı olmadan doğru hata üretilmesi. Bu testler **örnek üst servis** kullanır; ücretli OpenAI görsel üretimi yapılmış sayılmaz.

Gerçek AI dönüşümü için aşağıdaki kurulum **zorunlu**. Sadece `index.html` dosyasını Android'de açmak bu sistemi çalıştırmaz.

## Kurulum: internette çalışan bir sunucu

1. [OpenAI API Platformu](https://platform.openai.com/) hesabında ayrı bir API projesi/anahtarı ve görsel üretim erişimi hazırla. API faturalandırması, ChatGPT aboneliğinden ayrıdır. Anahtarı bu sohbete yazma.
2. ZIP içindeki proje klasörünün **içindekilerini** bir özel GitHub deposunun kök dizinine yükle. `render.yaml`, `server.cjs`, `index.html`, `assets/` klasörü aynı seviyede olmalı. Gerçek fotoğrafını veya API anahtarını GitHub'a yükleme.
3. [Render Dashboard](https://dashboard.render.com/) içinden **New → Blueprint** seç, GitHub deposunu bağla. `render.yaml` dosyası web servisini tanımlar. `starter` planı ücretli olabilir; daha düşük planların uykuya geçmesi uzun AI işlemlerini etkileyebilir.
4. Render’ın istediği gizli ortam değerlerini **Render arayüzünde** gir: `OPENAI_API_KEY` = yalnızca kendi API anahtarın; `APP_ACCESS_TOKEN` = senin bildiğin, en az 16 karakterli güçlü erişim kodu. `HOST=0.0.0.0` ve `NODE_ENV=production` dosyadan gelir. Yayınlamayı tamamla.
5. Render sana verdiği **HTTPS adresini** Android Chrome'da aç. Menüden **Fotoğraf Yükle** seç, kendi galeri fotoğrafını seç. Kod istenirse belirlediğin `APP_ACCESS_TOKEN` değerini gir. Gerçek AI resmi oluşturduğunda alt alanda karakter çıkacak.

**Gizlilik:** Fotoğrafı yapay zekâyla dönüştürmek için sunucu üzerinden OpenAI API'sine gönderiyoruz. Uygulama sunucusu fotoğraf ve sonucu diske kaydetmez. Model hizmetinin kendi veri işleme koşulları geçerlidir. Fotoğrafı sadece sahibinin izniyle yükle.

## Telefon üzerinden son test

Telefonunda yayımlanan HTTPS bağlantısında şu adımları kontrol et:

- İlk açılış: Fotoğraf Önizleme Alanı **boş**, Eklenen Karakter Görseli **boş**.
- Galeriden fotoğraf seç: Orijinali **yalnız üstte**, alt alan **boş**; AI işlemi başlar.
- Kendi erişim kodunu gir: işlem durumu görüntülenir; gerçek AI sonuç PNG'si geldiğinde **yalnız alttaki alana** yerleşir.
- İnternet/anahtar/limit hatası: Alt alan **boş** kalır, hata mesajı çıkar.
- Fotoğrafı kaldır: Her iki alan boşalır. Sayfayı yenile: iki alan yine boş kalır.

Android telefonunu bu çalışma ortamından uzaktan açıp kontrol edemiyorum. Son gerçek telefon testini, HTTPS bağlantısına eriştiğinde kendi cihazından yapabilirsin. İncelemem için **API anahtarını değil, yayımlanan site bağlantısını ve gördüğün hata mesajını** paylaşman yeterli.

## Teknik tanılama

Sunucu durumunu tarayıcıdan ziyaret et:

- `https://SENIN-SITEN.onrender.com/api/health` → `{ "ok": true }`
- `https://SENIN-SITEN.onrender.com/api/status` → `ready: true` olması, **yalnızca anahtarın tanımlandığını** söyler. Anahtarın gerçekten geçerli olduğunu ve görsel üretildiğini kanıtlamaz.

Yerel bilgisayarda Node.js 20+ ile:

```bash
npm test
node --check server.cjs
```

Gerçek API'yi güvenli bir ortamda, kendi fotoğrafınla ayrıca doğrulamak için:

```bash
U_BASE_URL=https://SENIN-SITEN.onrender.com APP_ACCESS_TOKEN=KENDI_ERISIM_KODUN node verify-live.mjs ./fotografim.jpg
```

Yukarıdaki ikinci komut **gerçek ve ücretlendirilebilir** bir AI isteği gönderir. Başarılı olursa `u-gercek-ai-sonuc.png` kaydedilir. Bu, PNG'nin teknik olarak üretildiğini kanıtlar; kişinin benzerliğini ve estetik kaliteyi otomatik garanti etmez.

## Neden önceki “Failed to fetch” hatası görülebiliyordu?

`file://` ile açılan HTML'nin yanında `/api/character` sunucusu olmaz. Ayrıca tek bir uzun HTTP bağlantısı ağ geçidinin süre sınırına takılabilir. Bu sürüm, üretimi **ayrı arka plan işi** olarak başlatır ve telefondan kısa durum kontrolleriyle izler. Telefon fotoğrafı kaldırırsa işlem iptali talep edilir. Sunucu yeniden başlarsa devam eden işlem kaybolabilir; tekrar denemek gerekir.

### Tasarım ve doğruluk sınırları

- Eski neon-yeşil Ü menüsü, Gölge Kristali amblemi ve fotoğraf sayfasının görsel CSS'si değiştirilmedi.
- Kullanıcının galeriden seçtiği fotoğraf, kişinin **tek kimlik referansıdır**; `assets/sabit_tarz_referansi.jpg` sadece stil örneğidir.
- Sunucu erişilebilir ve anahtar geçerli olsa bile, model çıkışında görsel kalite ve yüz benzerliği **%100 garanti edilemez**.
- Uygulama yalnızca geçerli PNG sonucunu ekler. Kişiye benzeyip benzemediğine karar vermek için çıktının ayrıca gözle kontrol edilmesi gerekir.
- Sunucu tek örnekli ve bellekte tutulan iş kuyruğu kullanır; büyük ölçekli çok oyunculu üretim için veritabanı ve kullanıcı başına kimlik doğrulama gereklidir.
