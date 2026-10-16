import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function hitungCRC16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function validasiCRC(qris) {
  if (typeof qris !== 'string' || qris.length < 8) return false;
  const posisiTagCRC = qris.slice(0, -4).endsWith('6304');
  if (!posisiTagCRC) return false;

  const dataTanpaNilaiCRC = qris.slice(0, -4);
  const crcAsli = qris.slice(-4).toUpperCase();
  const crcHitung = hitungCRC16(dataTanpaNilaiCRC);
  return crcAsli === crcHitung;
}

export function parseTLV(qris) {
  const hasil = [];
  let index = 0;

  while (index < qris.length) {
    if (index + 4 > qris.length) {
      throw new Error(`Format TLV QRIS rusak pada posisi indeks ${index}.`);
    }

    const tag = qris.slice(index, index + 2);
    const lengthStr = qris.slice(index + 2, index + 4);
    const length = parseInt(lengthStr, 10);

    if (Number.isNaN(length) || length < 0) {
      throw new Error(`Panjang nilai (length) tidak valid untuk Tag ${tag}: "${lengthStr}".`);
    }

    const batasAkhirNilai = index + 4 + length;
    if (batasAkhirNilai > qris.length) {
      throw new Error(
        `Nilai Tag ${tag} melebihi panjang string QRIS (butuh ${length} karakter, tersisa ${qris.length - (index + 4)}).`
      );
    }

    const value = qris.slice(index + 4, batasAkhirNilai);
    hasil.push({ tag, length, value });
    index = batasAkhirNilai;
  }

  return hasil;
}

export function formatTagTLV(tag, value) {
  const strValue = String(value);
  const panjang = strValue.length.toString().padStart(2, '0');
  return `${tag}${panjang}${strValue}`;
}

export function ekstrakInfoQRIS(qris) {
  const elemenTLV = parseTLV(qris.trim());
  const petaTag = {};
  for (const item of elemenTLV) {
    petaTag[item.tag] = item.value;
  }

  return {
    jenisQRIS:
      petaTag['01'] === '11'
        ? 'Statis (11)'
        : petaTag['01'] === '12'
        ? 'Dinamis (12)'
        : `Tidak diketahui (${petaTag['01'] || '-'})`,
    namaMerchant: petaTag['59'] || '-',
    kotaMerchant: petaTag['60'] || '-',
    kodePos: petaTag['61'] || '-',
    mataUang: petaTag['53'] === '360' ? 'IDR (360)' : petaTag['53'] || '-',
    nominal: petaTag['54'] ? Number(petaTag['54']) : null,
    indikatorBiaya: petaTag['55'] || null,
    biayaTetap: petaTag['56'] ? Number(petaTag['56']) : null,
    biayaPersen: petaTag['57'] ? Number(petaTag['57']) : null,
    crcValid: validasiCRC(qris.trim()),
    crc: petaTag['63'] || '-',
  };
}

export function ubahKeQRISDinamis(qrisStatis, nominal, opsi = {}) {
  if (!qrisStatis || typeof qrisStatis !== 'string') {
    throw new Error('String QRIS statis wajib diisi.');
  }

  const qrisBersih = qrisStatis.trim();

  if (!opsi.lewatiValidasiCRC && !validasiCRC(qrisBersih)) {
    throw new Error(
      'Checksum CRC16 pada QRIS sumber tidak valid. Pastikan string QRIS utuh atau aktifkan opsi { lewatiValidasiCRC: true }.'
    );
  }

  const nominalBersih =
    typeof nominal === 'string' ? nominal.replace(/[^0-9]/g, '') : String(nominal);
  const angkaNominal = Number(nominalBersih);

  if (!nominalBersih || !Number.isFinite(angkaNominal) || angkaNominal <= 0 || !Number.isInteger(angkaNominal)) {
    throw new Error('Nominal transaksi harus berupa angka bulat positif dalam Rupiah (contoh: 25000).');
  }

  const daftarTLV = parseTLV(qrisBersih);
  const tagYangDihapus = new Set(['54', '55', '56', '57', '63']);
  const tlvBaru = [];
  let adaTag01 = false;

  for (const item of daftarTLV) {
    if (tagYangDihapus.has(item.tag)) {
      continue;
    }
    if (item.tag === '01') {
      tlvBaru.push({ tag: '01', value: '12' });
      adaTag01 = true;
    } else {
      tlvBaru.push({ tag: item.tag, value: item.value });
    }
  }

  if (!adaTag01) {
    const indeksTag00 = tlvBaru.findIndex((el) => el.tag === '00');
    const posisiSisip = indeksTag00 >= 0 ? indeksTag00 + 1 : 0;
    tlvBaru.splice(posisiSisip, 0, { tag: '01', value: '12' });
  }

  const elemenTransaksi = [{ tag: '54', value: String(angkaNominal) }];

  if (opsi.tipeBiaya) {
    const tipe = opsi.tipeBiaya.toLowerCase();
    if (tipe === 'manual') {
      elemenTransaksi.push({ tag: '55', value: '01' });
    } else if (tipe === 'tetap') {
      const biayaBersih =
        typeof opsi.nilaiBiaya === 'string'
          ? opsi.nilaiBiaya.replace(/[^0-9]/g, '')
          : String(opsi.nilaiBiaya);
      const biayaRupiah = Number(biayaBersih);
      if (!biayaBersih || !Number.isFinite(biayaRupiah) || biayaRupiah <= 0 || !Number.isInteger(biayaRupiah)) {
        throw new Error('Nilai biaya tetap (Rupiah) harus berupa angka bulat positif.');
      }
      elemenTransaksi.push({ tag: '55', value: '02' });
      elemenTransaksi.push({ tag: '56', value: String(biayaRupiah) });
    } else if (tipe === 'persen') {
      const biayaPersen = Number(opsi.nilaiBiaya);
      if (!Number.isFinite(biayaPersen) || biayaPersen <= 0 || biayaPersen > 100) {
        throw new Error('Nilai biaya persentase harus berupa angka antara 0 hingga 100 (contoh: 2.5).');
      }
      elemenTransaksi.push({ tag: '55', value: '03' });
      elemenTransaksi.push({ tag: '57', value: String(biayaPersen) });
    } else {
      throw new Error(`Tipe biaya "${opsi.tipeBiaya}" tidak dikenali. Gunakan 'tetap', 'persen', atau 'manual'.`);
    }
  }

  let indeksSisipNominal = tlvBaru.findIndex((el) => el.tag === '58');
  if (indeksSisipNominal === -1) {
    const indeksTag53 = tlvBaru.findIndex((el) => el.tag === '53');
    indeksSisipNominal = indeksTag53 >= 0 ? indeksTag53 + 1 : tlvBaru.length;
  }
  tlvBaru.splice(indeksSisipNominal, 0, ...elemenTransaksi);

  const bodyPayload = tlvBaru.map((el) => formatTagTLV(el.tag, el.value)).join('');
  const payloadUntukCRC = `${bodyPayload}6304`;
  const crcBaru = hitungCRC16(payloadUntukCRC);

  return `${payloadUntukCRC}${crcBaru}`;
}

export function jalankanModeInteraktif(defaultQRIS) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const tanya = (pertanyaan) => new Promise((resolve) => rl.question(pertanyaan, resolve));

  (async () => {
    try {
      console.log('=== INPUT INTERAKTIF QRIS DINAMIS ===');
      const inputQRIS = await tanya('1. Masukkan String QRIS Statis (kosongkan untuk pakai QRIS demo): ');
      const qrisSumber = inputQRIS.trim() || defaultQRIS;

      const inputNominal = await tanya('2. Masukkan Nominal Tagihan (Rp, contoh: 35000): ');
      const inputTipeBiaya = await tanya('3. Tambah Biaya Layanan? (kosongkan / ketik: tetap / persen / manual): ');

      const opsi = {};
      if (inputTipeBiaya.trim()) {
        opsi.tipeBiaya = inputTipeBiaya.trim();
        if (opsi.tipeBiaya !== 'manual') {
          opsi.nilaiBiaya = await tanya(`4. Masukkan Nilai Biaya (${opsi.tipeBiaya}): `);
        }
      }

      const hasilDinamis = ubahKeQRISDinamis(qrisSumber, inputNominal, opsi);
      const info = ekstrakInfoQRIS(hasilDinamis);

      console.log('\n=== HASIL QRIS DINAMIS ===');
      console.log('Merchant      :', info.namaMerchant);
      console.log('Nominal (IDR) :', `Rp ${info.nominal.toLocaleString('id-ID')}`);
      console.log('CRC16 Baru    :', `${info.crc} (Valid: ${info.crcValid})`);
      console.log('\nString Payload QRIS Dinamis:');
      console.log(hasilDinamis);
    } catch (err) {
      console.error('\nError:', err.message);
    } finally {
      rl.close();
    }
  })();
}

export default {
  ubahKeQRISDinamis,
  ekstrakInfoQRIS,
  validasiCRC,
  hitungCRC16,
  parseTLV,
  formatTagTLV,
  jalankanModeInteraktif,
};

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const args = process.argv.slice(2);

  const bodyContohStatis =
    '000201' +
    '010211' +
    '26660014ID.CO.QRIS.WWW01189360091400000001230215ID10200000001230303UMI' +
    '52045812' +
    '5303360' +
    '5802ID' +
    '5919KOPI NUSANTARA JAYA' +
    '6012BANJARNEGARA' +
    '610553412' +
    '6304';
  const contohQRISStatis = bodyContohStatis + hitungCRC16(bodyContohStatis);

  if (args[0] === '--input' || args[0] === '-i') {
    jalankanModeInteraktif(contohQRISStatis);
  } else if (args.length >= 2) {
    try {
      const [inputQRIS, inputNominal, inputTipeBiaya, inputNilaiBiaya] = args;
      const opsi = {};
      if (inputTipeBiaya) {
        opsi.tipeBiaya = inputTipeBiaya;
        opsi.nilaiBiaya = inputNilaiBiaya;
      }

      const qrisDinamis = ubahKeQRISDinamis(inputQRIS, inputNominal, opsi);
      const info = ekstrakInfoQRIS(qrisDinamis);

      console.log('=== HASIL KONVERSI QRIS DINAMIS ===');
      console.log('Merchant      :', info.namaMerchant);
      console.log('Kota          :', info.kotaMerchant);
      console.log('Jenis QRIS    :', info.jenisQRIS);
      console.log('Nominal (IDR) :', `Rp ${info.nominal.toLocaleString('id-ID')}`);
      if (info.biayaTetap) console.log('Biaya Tetap   :', `Rp ${info.biayaTetap.toLocaleString('id-ID')}`);
      if (info.biayaPersen) console.log('Biaya Persen  :', `${info.biayaPersen}%`);
      console.log('CRC16 Baru    :', `${info.crc} (Valid: ${info.crcValid})`);
      console.log('\nPayload QRIS Dinamis:');
      console.log(qrisDinamis);
    } catch (err) {
      console.error('Gagal mengonversi QRIS:', err.message);
      process.exit(1);
    }
  } else {
    const NOMINAL_TAGIHAN = 75000;

    console.log('=== DEMO KONVERSI QRIS STATIS KE DINAMIS (NODE.JS ESM) ===\n');
    console.log('1. QRIS Statis Awal:');
    console.log('   Payload :', contohQRISStatis);

    const qrisDinamis = ubahKeQRISDinamis(contohQRISStatis, NOMINAL_TAGIHAN);
    const infoDinamis = ekstrakInfoQRIS(qrisDinamis);
    console.log(`\n2. QRIS Dinamis (Nominal diatur ke Rp ${infoDinamis.nominal.toLocaleString('id-ID')}):`);
    console.log('   Payload :', qrisDinamis);
    console.log('   Info    :', infoDinamis);

    const qrisPlusBiaya = ubahKeQRISDinamis(contohQRISStatis, NOMINAL_TAGIHAN, {
      tipeBiaya: 'tetap',
      nilaiBiaya: 1000,
    });
    console.log(`\n3. QRIS Dinamis (Nominal Rp ${infoDinamis.nominal.toLocaleString('id-ID')} + Biaya Tetap Rp 1.000):`);
    console.log('   Payload :', qrisPlusBiaya);
    console.log('   Info    :', ekstrakInfoQRIS(qrisPlusBiaya));
  }
}
