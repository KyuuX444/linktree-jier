# Konversi QRIS Statis ke Dinamis (Node.js ESM)

Modul dan perangkat CLI berbasis **Node.js murni (ES Module / Zero Dependency)** untuk mengubah *payload* **QRIS Statis** menjadi **QRIS Dinamis** sesuai standar spesifikasi **EMVCo / Bank Indonesia**.

Modul ini mengurai struktur **TLV (*Tag-Length-Value*)** secara presisi, menyisipkan nominal tagihan otomatis (*Tag* `54`), mengatur biaya layanan/tip opsional (*Tag* `55`, `56`, `57`), dan menghitung ulang *checksum* **CRC-16/CCITT-FALSE** (*Tag* `6304`).

## Fitur Utama

* **Tanpa Dependency Eksternal**: Berjalan murni menggunakan modul bawaan Node.js (`node:readline`, `node:path`, `node:url`).
* **Parser TLV EMVCo Presisi**: Membaca setiap *tag* dan panjang karakter secara akurat tanpa merusak data identitas *merchant*.
* **Pengaturan Nominal Fleksibel**: Menerima input nominal berupa angka (`75000`) maupun teks berformat (`"Rp 75.000"` atau `"75.000"`).
* **Dukungan Biaya Layanan & Tip**: Mendukung penambahan biaya admin tetap (Rupiah), persentase (`%`), atau input tip manual di aplikasi pembayaran pelanggan.
* **Validasi & Perhitungan Otomatis CRC16**: Memverifikasi keabsahan QRIS sumber dan menghitung ulang 4 karakter *hexadecimal* CRC16 baru secara otomatis.
* **Tiga Mode Penggunaan**: Dapat dijalankan langsung via argumen CLI, mode tanya-jawab interaktif di terminal, atau diimpor sebagai modul ESM di file lain.

## Persyaratan Sistem

* **Node.js** versi `16.0.0` atau lebih baru.
* Pengaturan `"type": "module"` di dalam `package.json`.

## Instalasi & Persiapan

1. Siapkan folder proyek dan inisialisasi `package.json` dengan dukungan **ES Module**:

```bash
npm init -y
npm pkg set type="module"
```

2. Simpan kode program utama Anda dengan nama **`index.js`** (atau `inde.js` jika mengikuti penamaan khusus Anda) di dalam folder tersebut.

3. Ambil teks (*string*) dari gambar **QRIS Statis** milik toko Anda menggunakan aplikasi pemindai QR (seperti Google Lens atau *QR Code Reader* biasa). Salin teks hasilnya yang diawali dengan `000201010211...` dan diakhiri 4 karakter *checksum* setelah `6304`.

## Cara Penggunaan via Terminal (CLI)

### 1. Mode Tanya-Jawab Interaktif (`--input` / `-i`)

Jalankan perintah berikut agar terminal memandu Anda memasukkan *string* QRIS, nominal Rupiah, dan opsi biaya tambahan secara bertahap:

```bash
node index.js --input
```

### 2. Mode Argumen Langsung (Tanpa Biaya Tambahan)

Masukkan *string* QRIS statis di dalam tanda kutip diikuti nominal tagihan dalam Rupiah:

```bash
node index.js "00020101021126660014ID.CO.QRIS.WWW..." 50000
```

### 3. Mode Argumen dengan Biaya Layanan / Tip

Tambahkan jenis biaya (`tetap`, `persen`, atau `manual`) beserta nilainya setelah argumen nominal:

```bash
# Menambah biaya layanan tetap Rp 1.500
node index.js "00020101021126660014ID.CO.QRIS.WWW..." 50000 tetap 1500

# Menambah biaya layanan 2.5%
node index.js "00020101021126660014ID.CO.QRIS.WWW..." 50000 persen 2.5

# Mengaktifkan kolom tip manual di aplikasi pembeli
node index.js "00020101021126660014ID.CO.QRIS.WWW..." 50000 manual
```

### 4. Mode Demo Bawaan

Jalankan file tanpa argumen untuk mengeksekusi simulasi konversi menggunakan nilai variabel `NOMINAL_TAGIHAN` di dalam kode:

```bash
node index.js
```

## Cara Penggunaan sebagai Modul (`import` ESM)

Anda dapat mengimpor fungsi dari `index.js` ke dalam file proyek lain (seperti *server* API Express/Fastify, sistem kasir POS, atau bot WhatsApp/Telegram):

```javascript
import {
  ubahKeQRISDinamis,
  ekstrakInfoQRIS,
  validasiCRC,
} from './index.js';

const qrisStatis =
  '00020101021126660014ID.CO.QRIS.WWW01189360091400000001230215ID10200000001230303UMI5204581253033605802ID5919KOPI NUSANTARA JAYA6012BANJARNEGARA6105534126304308E';

// 1. Konversi standar dengan nominal Rp 35.000
const qrisDinamis = ubahKeQRISDinamis(qrisStatis, 35000);
console.log('Payload Dinamis:', qrisDinamis);

// 2. Konversi dengan tambahan biaya admin tetap Rp 1.000
const qrisDenganBiaya = ubahKeQRISDinamis(qrisStatis, 35000, {
  tipeBiaya: 'tetap',
  nilaiBiaya: 1000,
});

// 3. Mengekstrak informasi detail dari payload QRIS
const info = ekstrakInfoQRIS(qrisDenganBiaya);
console.log(info);
```

## Referensi Fungsi & Parameter

### `ubahKeQRISDinamis(qrisStatis, nominal, opsi)`

Mengubah *string* QRIS statis menjadi *string* QRIS dinamis baru.

| Parameter | Tipe Data | Wajib | Keterangan |
| :--- | :--- | :--- | :--- |
| `qrisStatis` | `string` | Ya | Teks *payload* QRIS statis asli milik *merchant*. |
| `nominal` | `number` \| `string` | Ya | Nominal tagihan dalam Rupiah (contoh: `75000` atau `"Rp 75.000"`). |
| `opsi.tipeBiaya` | `'tetap'` \| `'persen'` \| `'manual'` | Tidak | Jenis biaya layanan/tip tambahan (*Tag* `55`). |
| `opsi.nilaiBiaya` | `number` \| `string` | Tidak | Besaran biaya tambahan dalam Rupiah (*Tag* `56`) atau persentase `1`–`100` (*Tag* `57`). |
| `opsi.lewatiValidasiCRC` | `boolean` | Tidak | Jika diatur `true`, tetap memproses konversi meskipun *checksum* QRIS awal tidak cocok (bawaan: `false`). |

### Daftar Fungsi Ekspor Lainnya

| Nama Fungsi | Kegunaan |
| :--- | :--- |
| `ekstrakInfoQRIS(qris)` | Mengembalikan objek berisi nama *merchant*, kota, kode pos, jenis QRIS (`Statis`/`Dinamis`), nominal, rincian biaya, dan status validitas CRC16. |
| `validasiCRC(qris)` | Memeriksa apakah 4 karakter terakhir pada *string* QRIS sesuai dengan perhitungan algoritma CRC-16/CCITT-FALSE (`true`/`false`). |
| `hitungCRC16(str)` | Menghitung nilai 4 karakter *hexadecimal* CRC-16/CCITT-FALSE dari *string* input. |
| `parseTLV(qris)` | Mengurai *string* QRIS menjadi *array* objek `[{ tag, length, value }]`. |
| `formatTagTLV(tag, value)` | Membentuk format string `Tag + Length (2 digit) + Value`. |

## Mengubah String QRIS Dinamis Menjadi Gambar QR Code

Untuk mengubah *string* hasil konversi menjadi gambar `.png`, *Data URL* (Base64), atau menampilkannya di terminal agar siap di-*scan*, gunakan paket `qrcode`:

```bash
npm install qrcode
```

Contoh kode pembuatan gambar QR:

```javascript
import QRCode from 'qrcode';
import { ubahKeQRISDinamis } from './index.js';

const qrisDinamis = ubahKeQRISDinamis(qrisStatis, 50000);

// Simpan menjadi file gambar PNG
await QRCode.toFile('./qris-tagihan.png', qrisDinamis, {
  width: 400,
  margin: 2,
});

// Tampilkan QR Code langsung di layar terminal
const qrTerminal = await QRCode.toString(qrisDinamis, {
  type: 'terminal',
  small: true,
});
console.log(qrTerminal);
```
