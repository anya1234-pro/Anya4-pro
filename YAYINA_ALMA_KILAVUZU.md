# Ü oyunu — yayına alma kontrol listesi

Bu klasör GitHub deposunun köküne doğrudan yüklemeye hazırdır. `render.yaml`, `server.cjs`, `index.html` ve `assets/` aynı dizindedir.

## Çalışan proje — hazır olanlar

- Eski Ü menüsü, stil referansı, sunucu ve API iş kuyruğu.
- Otomatik `npm test` testleri örnek servisle geçti.
- Gerçek OpenAI API kullanımına uygun model: `gpt-image-2.5-sunburst`.

## Hesap sahibi tarafından yapılması gerekenler

1. ChatGPT'deki GitHub ve Render uygulama bağlantılarını yetkilendir. Bunlar bağlanmadan bu sohbet GitHub depo oluşturamaz veya Render'da yayın yapamaz.
2. [OpenAI Platform](https://platform.openai.com/) hesabında API projesi oluştur, API faturalandırmasını etkinleştir ve gizli API anahtarı oluştur.
3. API anahtarını asla bu sohbetin içine, HTML'ye veya GitHub deposuna yazma. Sadece Render'ın gizli ortam değişkeni `OPENAI_API_KEY` olarak sakla.
4. Render'da `APP_ACCESS_TOKEN` için güçlü (en az 16 karakterli) gizli erişim kodu belirle. Bu kodu da GitHub'a koyma.
5. `render.yaml` varsayılan olarak `starter` planını kullanır; Render bu plan için ücret isteyebilir. Yayın öncesinde fiyatlandırmayı onayla.
6. Render HTTPS sitesi açıldığında `/api/health` endpointini kontrol et ve Android Chrome'da kendi galerinden bir fotoğraf seçerek gerçek üretimi dene.

## Gerçek test kanıtı

`/api/status` yanıtındaki `ready: true`, API anahtarının *var olduğunu* söyler; anahtarın geçerli olduğunu veya gerçek AI görseli üretildiğini kanıtlamaz. Başarı için `/api/character` işinin tamamlanıp `/api/jobs/:id/image` üzerinden geçerli PNG dönmesi gerekir.

```bash
npm test
npm start
```

Herhangi bir ücretli API çağrısı yapılmadı. Gerçek üretim ve fiziksel Android tarayıcı testi henüz doğrulanmadı.
