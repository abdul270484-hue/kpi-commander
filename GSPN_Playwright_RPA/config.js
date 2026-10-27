const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

module.exports = {
    // GSPN Portal URL & Selectors
    GSPN_URL: 'https://gspn2.samsungcsportal.com',
    DEFAULT_USER_ID: process.env.GSPN_USER_ID || '',
    DEFAULT_PASSWORD: process.env.GSPN_PASSWORD || '',
    
    // ASC Target Branches
    ASC_CODES: [
    {
        "code": "0007130603",
        "name": "0007130603 / BE UNICOM BEBELITUNG BANGKA BELITUNG JL. ZAINUDIN ABA, PANGKAL LALANG",
        "short": "BE BELITUNG"
    },
    {
        "code": "0006469030",
        "name": "0006469030 / BE UNICOM BITUNG TATELU,KEL.TENDEKI,RT.10/3,KEC. JL.MANADO-BITUNG VIA JALUR TENDEKI-",
        "short": "BE BITUNG"
    },
    {
        "code": "0004986640",
        "name": "0004986640 / BE UNICOM CURUP TENGAH KAB.REJANG LEBONG, JL.SULTAN JAMIL,KEPALA SIRING KEC.",
        "short": "BE CURUP"
    },
    {
        "code": "0006479073",
        "name": "0006479073 / BE UNICOM KETAPANG,KAB.KETAPANG, JL.KH.MANSYUR NO.88,SUKAHARJA,",
        "short": "BE KETAPANG"
    },
    {
        "code": "0007115862",
        "name": "0007115862 / BE UNICOM KONAWE TENGGARA JL LAKIDENDE NO59,PEREMPATAN AROMBU",
        "short": "BE KONAWE"
    },
    {
        "code": "0005773598",
        "name": "0005773598 / BE UNICOM KOTA BUMI KEC.SUNGKAI TENGAH,KABUPATEN JL.PROTOKOL SIMPANG BATU NANGKOP",
        "short": "BE KOTA BUMI"
    },
    {
        "code": "0004986618",
        "name": "0004986618 / BE UNICOM METRO METRO, LAMPUNG JlN IMAM BONJOL, 22 HADIMULYO BARAT",
        "short": "BE METRO"
    },
    {
        "code": "0004986619",
        "name": "0004986619 / BE UNICOM PRINGSEWU KAB.PRINGSEWU,LAMPUNG JL.PRINGADI NO.707-125 PODOMORO",
        "short": "BE PRINGSEWU"
    },
    {
        "code": "0006479074",
        "name": "0006479074 / BE UNICOM SANGGAU SANGGAU KALIMANTAN BARAT DUSUN KAYU TUNU SUNGAI MUNTIK",
        "short": "BE SANGGAU"
    },
    {
        "code": "0004886679",
        "name": "0004886679 / BUJM SRAGEN, KROYO, KABUPATEN SRAGEN JL.RA KARTINI NO 20 TAMAN ASRI,",
        "short": "SRAGEN"
    },
    {
        "code": "0004924733",
        "name": "0004924733 / UNICOM AMBON KEL.HONIPOPU KEC.SIRIMAU JL.A.Y.PATTY NO.84 RT 003 RW 02",
        "short": "AMBON"
    },
    {
        "code": "0002321530",
        "name": "0002321530 / UNICOM BANDAR JAYA KEL.BANDAR JAYA TIMUR KEC.TERBANGGI JL.PROKLAMATOR RAYA RT02/RW01",
        "short": "BANDAR JAYA"
    },
    {
        "code": "0005195856",
        "name": "0005195856 / UNICOM BERAU KALIMANTAN TIMUR JL. H. ISA II NO.19",
        "short": "BERAU"
    },
    {
        "code": "0004924882",
        "name": "0004924882 / UNICOM BOJONEGORO BOJONEGORO JL.UNTUNG SUROPATI NO.91.KLANGON",
        "short": "BOJONEGORO"
    },
    {
        "code": "0004411723",
        "name": "0004411723 / UNICOM Banjarmasin BANJARMASIN JL.AHMAD YANI KM.5,8 NO.9",
        "short": "BANJARMASIN"
    },
    {
        "code": "0004411733",
        "name": "0004411733 / UNICOM Bengkulu BENGKULU JL.SEDAP MALAM, KEL. NUSA INDAH,",
        "short": "BENGKULU"
    },
    {
        "code": "0008388746",
        "name": "0008388746 / UNICOM Bontang KEC. BONTANG UTARA JL.IMAM BONJOL RT.04, KEL.API-API",
        "short": "BONTANG"
    },
    {
        "code": "0004924441",
        "name": "0004924441 / UNICOM DENPASAR MAHENDRADATA BARAT BALI JL.MAHENDRADATA NO.100 X DENPASAR",
        "short": "DENPASAR"
    },
    {
        "code": "0004924851",
        "name": "0004924851 / UNICOM GORONTALO KEC.DUNGINGI-GORONTALO JL.H.B.JASSIN NO.7,KEL.LIBUO,",
        "short": "GORONTALO"
    },
    {
        "code": "0004924773",
        "name": "0004924773 / UNICOM JAYAPURA (DEPAN KANTOR BPJS JAYAPURA) KEL. JL.RAYA ABEPURA KOTARAJA NO.3",
        "short": "JAYAPURA"
    },
    {
        "code": "0002217884",
        "name": "0002217884 / UNICOM KARAWANG JL.GALUH MAS RAYA,DESA SUKAHARJA, RUKO GRAND PLAZA BLOK IV NO.31-32",
        "short": "KARAWANG"
    },
    {
        "code": "0004924895",
        "name": "0004924895 / UNICOM KENDARI WUA-WUA KECAMATAN WUA-WUA JL.MT HARYONO NO 108 KELURAHAN",
        "short": "KENDARI"
    },
    {
        "code": "0004925234",
        "name": "0004925234 / UNICOM KUPANG KEC.OEBOBO,KUPANG JL.CAK DOKO NO.54,KEL OEBOBO",
        "short": "KUPANG"
    },
    {
        "code": "0004925215",
        "name": "0004925215 / UNICOM LUWUK KOTA JL.JENDRAL SUDIRMAN NO.33 LUWUK",
        "short": "LUWUK"
    },
    {
        "code": "0004411732",
        "name": "0004411732 / UNICOM Lampung BANDAR LAMPUNG JL CUT NYAK DIEN NO 7B-C",
        "short": "BANDAR LAMPUNG"
    },
    {
        "code": "0004924922",
        "name": "0004924922 / UNICOM MAKASSAR SULAWESI SELATAN JL.MONGINSIDI NO.51 A-B MAKASSAR",
        "short": "MAKASSAR"
    },
    {
        "code": "0004924924",
        "name": "0004924924 / UNICOM MAMUJU KAREMA/SIMBORO KEC.MAMUJU KOTA JL.DIPONEGORO RUKO KE-5 KELURAHAN",
        "short": "MAMUJU"
    },
    {
        "code": "0004924355",
        "name": "0004924355 / UNICOM MANADO RUKO BOULEVARD SQUARE BLOK A NO JL.PIERE TENDEAN BOULEVARD,KOMP.",
        "short": "MANADO"
    },
    {
        "code": "0004924926",
        "name": "0004924926 / UNICOM PALOPO KEC. WARA UTARA, KOTA PALOPO JL. DR. RATULANGI NO.56",
        "short": "PALOPO"
    },
    {
        "code": "0004925216",
        "name": "0004925216 / UNICOM PALU NO.57,TATURA SEL.,PALU SEL.,KOTA RUKO VIII,JL.JENDERAL BASUKI RAHMAT",
        "short": "PALU"
    },
    {
        "code": "0001923453",
        "name": "0001923453 / UNICOM PANGKALAN BUN PANGKALAN BUN,KAB.KOTAWARINGIN JL.A.YANI,KEL.BARU,KEC.ARUT SELATAN",
        "short": "PANGKALAN BUN"
    },
    {
        "code": "0003901060",
        "name": "0003901060 / UNICOM PATI KEC.PATI,KAB.PATI,JAWA TENGAH JL.KAMANDOWO PATI KIDUL",
        "short": "PATI"
    },
    {
        "code": "0004924857",
        "name": "0004924857 / UNICOM PROBOLINGGO -PROBOLINGGO JL.PANGLIMA SUDIRMAN 188 F",
        "short": "PROBOLINGGO"
    },
    {
        "code": "0004411722",
        "name": "0004411722 / UNICOM Palangkaraya PALANGKARAYA Jl. Tjilik Riwut KM 0,7 KAV no 4-5",
        "short": "PALANGKARAYA"
    },
    {
        "code": "0009372619",
        "name": "0009372619 / UNICOM Pamekasan PATEMON-PAMEKASAN JL.TRUNOJOYO NO.121",
        "short": "PAMEKASAN"
    },
    {
        "code": "0004411730",
        "name": "0004411730 / UNICOM Pangkal Pinang PANGKALPINANG JL.SOEKARNO HATTA NO.222A",
        "short": "PANGKAL PINANG"
    },
    {
        "code": "0004411726",
        "name": "0004411726 / UNICOM Pontianak PONTIANAK JL.GAJAH MADA NO.78,",
        "short": "PONTIANAK"
    },
    {
        "code": "0001923454",
        "name": "0001923454 / UNICOM SAMPIT HULU,KAB.KOTAWARINGIN TIMUR JL.MT.HARYONO,KEL.MENTAWA BARU",
        "short": "SAMPIT"
    },
    {
        "code": "0005182120",
        "name": "0005182120 / UNICOM SDS WAREHOUSE NO.28 JL.RAYA PRANCIS,JATI MULYA PERGUDANGAN KOSAMBI PERMAI BLOK NN",
        "short": "SDS"
    },
    {
        "code": "0004925239",
        "name": "0004925239 / UNICOM SERPONG BLOK A2 NO.29 KARAWACI-TANGERANG JL.IMAM BONJOL RUKO VICTORIA PARK",
        "short": "SERPONG"
    },
    {
        "code": "0004925238",
        "name": "0004925238 / UNICOM SERPONG ITC-BSD BSD LANTAI 1,BLOK A3A JL.PAHLAWAN SERIBU NO.2,MALL ITC",
        "short": "SERPONG ITC-BSD"
    },
    {
        "code": "0004924700",
        "name": "0004924700 / UNICOM SIDOARJO JAWA TIMUR JL JENGGOLO NO 27-28, KEL. PUCANG",
        "short": "SIDOARJO"
    },
    {
        "code": "0004925270",
        "name": "0004925270 / UNICOM SINGARAJA BALI JL.A.YANI NO 94 LANTAI 2-SINGARAJA,",
        "short": "SINGARAJA"
    },
    {
        "code": "0004925218",
        "name": "0004925218 / UNICOM SORONG KEC.SORONG MANOI.SORONG JL.AHMAD YANI NO.97C,KEL.MALABUTOR",
        "short": "SORONG"
    },
    {
        "code": "0004411727",
        "name": "0004411727 / UNICOM Samarinda SAMARINDA JL.HASAN BASRI NO.64,",
        "short": "SAMARINDA"
    },
    {
        "code": "0005310660",
        "name": "0005310660 / UNICOM Singkawang SINGKAWANG JL.A.YANI NO.115 PASIRAN",
        "short": "SINGKAWANG"
    },
    {
        "code": "0005195827",
        "name": "0005195827 / UNICOM TANJUNG (SAMPING TOKO ROTI SU FA)-TANJUNG, JL.P.H.MOCH NOOR PEMBATAAN",
        "short": "TANJUNG"
    },
    {
        "code": "0004924770",
        "name": "0004924770 / UNICOM TERNATE TENGAH SANTIONG-TERNATE JL.MERDEKA KEL.GAMALAMA,KEC.TERNATE",
        "short": "TERNATE"
    },
    {
        "code": "0004924774",
        "name": "0004924774 / UNICOM TIMIKA PAPUA TENGAH JL. BUDI UTOMO, KEL. NAWARIPI",
        "short": "TIMIKA"
    },
    {
        "code": "0004411731",
        "name": "0004411731 / UNICOM Tanjung Pinang JL.DI PANDJAITAN KM.9,TANJUNGPINANG RUKO TAMAN GURINDAM 10",
        "short": "TANJUNGPINANG"
    }
],

    // File & Session Storage Paths
    AUTH_DIR: path.join(__dirname, '.auth'),
    STORAGE_STATE_PATH: path.join(__dirname, '.auth', 'storageState.json'),
    DOWNLOAD_DIR: path.join(__dirname, 'temp_downloads'),

    // Firebase Configuration
    FIREBASE_CONFIG: {
        projectId: "management-bujm-dashboard",
        appId: "1:686973979324:web:312ee50bb607be47621eb9",
        storageBucket: "management-bujm-dashboard.firebasestorage.app",
        apiKey: "AIzaSyDLKSMnHgiRE0v1KMW7S2iOOL4MjZ272pg",
        authDomain: "management-bujm-dashboard.firebaseapp.com",
        messagingSenderId: "686973979324"
    },

    // Automation Schedule Slots (Waktu Setempat)
    SCHEDULE_TIMES: [
        { time: '09:15', cron: '15 9 * * *', type: 'MORNING_BLAST', label: 'Tarikan Pagi (Full Dosa Cabang)' },
        { time: '12:15', cron: '15 12 * * *', type: 'REMINDER_FOLLOWUP', label: 'Follow-Up Siang (Reminder Bill Pagi)' },
        { time: '15:15', cron: '15 15 * * *', type: 'REMINDER_FOLLOWUP', label: 'Follow-Up Sore (Reminder Bill Pagi)' },
        { time: '17:15', cron: '15 17 * * *', type: 'REMINDER_FOLLOWUP', label: 'Closing Rekap & Final Reminder' }
    ],

    // Target Benchmarks
    TARGET_GD_MX: 6.4,
    TARGET_GD_CE: 2.4,

    // Auto Shutdown Configuration (Mandat BOS)
    AUTO_SHUTDOWN: {
        ENABLED: true,
        TARGET_TIME: '20:00',      // Format HH:MM (Jam 20:00 malam waktu setempat)
        GRACE_PERIOD_SEC: 60,      // Countdown notifikasi Windows 60 detik sebelum shutdown
        EXTEND_RPA_HOURS: true     // Jadwal tarikan GSPN berjalan terus sampai jam shutdown
    }
};
