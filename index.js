const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// 1. Inisialisasi Firebase Admin (Menghubungkan Vercel ke Firestore)
if (!admin.apps.length) {
    // Kunci rahasia Firebase akan ditaruh di Vercel Environment Variables nanti
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}
const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

// Rute Utama
app.get('/', (req, res) => {
    res.status(200).send('Server itsadesign aktif dengan sistem Poin & Moota!');
});

// TAMBAHKAN KODE INI UNTUK LOLOS "CHECK URL" MOOTA
app.get('/moota-webhook', (req, res) => {
    res.status(200).send('Webhook Endpoint Ready');
});

// 2. Endpoint Webhook Moota (POST)
app.post('/moota-webhook', async (req, res) => {
    try {
        // Verifikasi dari Moota
        const mootaSignature = req.headers['authorization'];
        if (mootaSignature !== process.env.MOOTA_SECRET_TOKEN) {
            return res.status(401).json({ error: "Token Rahasia Moota Salah." });
        }

        const mutasiMasuk = req.body;

        // Loop setiap data mutasi dari bank
        for (const mutasi of mutasiMasuk) {
            if (mutasi.type === 'CR') { // CR = Uang Masuk
                const nominalUang = parseInt(mutasi.amount);

                // Lacak transaksi di koleksi TRANSAKSI_PEMBAYARAN yang nominalnya sama dan PENDING
                const txSnapshot = await db.collection('TRANSAKSI_PEMBAYARAN')
                    .where('total_bayar', '==', nominalUang)
                    .where('status', '==', 'PENDING')
                    .limit(1)
                    .get();

                if (!txSnapshot.empty) {
                    const txDoc = txSnapshot.docs[0];
                    const txData = txDoc.data();
                    const userId = txData.id_user;
                    const paketId = txData.id_paket;

                    // A. Update status transaksi jadi SUCCESS
                    await txDoc.ref.update({ status: 'SUCCESS' });

                    // B. Ambil jumlah poin dari koleksi PAKET_LANGGANAN
                    const paketDoc = await db.collection('PAKET_LANGGANAN').doc(paketId).get();
                    if (paketDoc.exists) {
                        const poinDidapat = paketDoc.data().poin_didapat;

                        // C. Update saldo poin user dan masa aktif (30 hari)
                        const userRef = db.collection('USERS').doc(userId);
                        const expiredDate = new Date();
                        expiredDate.setDate(expiredDate.getDate() + 30); // Tambah 30 hari

                        await userRef.update({
                            poin_saldo: admin.firestore.FieldValue.increment(poinDidapat),
                            id_paket_aktif: paketId,
                            expired_at: admin.firestore.Timestamp.fromDate(expiredDate)
                        });

                        console.log(`Berhasil memproses user ${userId} untuk paket ${paketId}`);
                    }
                }
            }
        }

        res.status(200).send('Webhook Moota diproses dengan sukses');
    } catch (error) {
        console.error("Error memproses Moota:", error);
        res.status(500).json({ error: "Terjadi kesalahan di server." });
    }
});

module.exports = app;