const express = require('express');
const cors = require('cors');
const midtransClient = require('midtrans-client');

const app = express();
app.use(cors());
app.use(express.json());

// Masukkan Server Key Midtrans kamu di sini
const snap = new midtransClient.Snap({
    isProduction: false,
    serverKey: process.env.MIDTRANS_SERVER_KEY // <--- UBAH BAGIAN INI
});

// Jalur yang akan dipanggil oleh aplikasi Flutter kamu
app.post('/dapatkantoken', async (req, res) => {
    try {
        const parameter = {
            "transaction_details": {
                // Membuat ID Order acak agar tidak bentrok
                "order_id": "ORDER-" + Math.round((new Date()).getTime() / 1000),
                "gross_amount": 50000 // Harga Premium
            },
            "customer_details": {
                "email": req.body.email // Menerima email dari Flutter
            }
        };

        const transaction = await snap.createTransaction(parameter);
        // Mengirimkan token kembali ke Flutter
        res.json({ token: transaction.token }); 
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server itsadesign berjalan di port ${PORT}`);
});