const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Folder penyimpanan di server Railway
const folderFoto = path.join(__dirname, 'Hasil_Foto_Klien');
if (!fs.existsSync(folderFoto)) {
    fs.mkdirSync(folderFoto);
}

// Jalur untuk melihat daftar foto (Agar Anda bisa download dari rumah)
app.get('/list-foto', (req, res) => {
    fs.readdir(folderFoto, (err, files) => {
        if (err) return res.status(500).send('Gagal baca folder');
        res.send(files.map(f => `<li><a href="/download/${f}">${f}</a></li>`).join(''));
    });
});

// Jalur untuk download foto satu per satu
app.get('/download/:name', (req, res) => {
    res.download(path.join(folderFoto, req.params.name));
});

// Jalur untuk kirim foto dari web photobooth
app.post('/upload', (req, res) => {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).send({ success: false, msg: 'Kosong!' });

    const base64Data = imageBase64.replace(/^data:image\/jpeg;base64,/, "");
    const namaFile = `SnapBooth_${Date.now()}.jpg`;

    fs.writeFile(path.join(folderFoto, namaFile), base64Data, 'base64', (err) => {
        if (err) return res.status(500).send({ success: false });
        console.log(`✅ Foto Baru Masuk: ${namaFile}`);
        res.send({ success: true, fileName: namaFile });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server Railway Aktif di Port ${PORT}`);
});
