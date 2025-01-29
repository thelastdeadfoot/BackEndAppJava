const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 3000;

// Middlewares pour parser le corps sdes requêtes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
    res.send("Hello depuis Railway !");
});

// Configuration de multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let folderPath = req.query.folderPath || '';
        console.log('Original folderPath:', folderPath);

        // Supprimer les slashes initiaux ou le préfixe 'uploads/'
        folderPath = folderPath.replace(/^\/+|uploads\/+/g, '');
        console.log('FolderPath après suppression des slashes initiaux et de "uploads/":', folderPath);

        // Interdire les chemins contenant des protocoles comme 'http://'
        if (/^https?:\/\//i.test(folderPath)) {
            console.error('folderPath invalide contenant un protocole URL:', folderPath);
            return cb(new Error('Chemin de dossier invalide. Veuillez saisir un chemin relatif.'), false);
        }

        const safeFolderPath = path.normalize(folderPath).replace(/^(\.\.(\/|\\|$))+/, '');
        console.log('safeFolderPath après normalisation:', safeFolderPath);

        const fullFolderPath = path.join(__dirname, 'uploads', safeFolderPath);
        console.log('Chemin complet du dossier sur le serveur:', fullFolderPath);

        // Créer le dossier s'il n'existe pas
        fs.mkdirSync(fullFolderPath, { recursive: true });

        cb(null, fullFolderPath);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

// Middleware pour servir les fichiers statiques depuis le dossier 'public'
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Route POST pour uploader un fichier
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier uploadé' });
    }

    res.status(200).json({ message: 'Fichier uploadé avec succès', file: req.file });
});

// Pour supprimer un fichier
app.delete('/api/files', (req, res) => {
    const { folderPath, fileName } = req.body;

    // Vérifier que les paramètres sont fournis
    if (!folderPath || !fileName) {
        return res.status(400).json({ error: 'Le chemin du dossier et le nom du fichier sont requis.' });
    }

    // Sécuriser le chemin du dossier
    const safeFolderPath = path.normalize(folderPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullFolderPath = path.join(__dirname, 'uploads', safeFolderPath);

    // Construire le chemin complet du fichier
    const filePath = path.join(fullFolderPath, fileName);

    // Vérifier que le fichier existe
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Fichier non trouvé.' });
    }

    // Supprimer le fichier
    fs.unlink(filePath, (err) => {
        if (err) {
            console.error('Erreur lors de la suppression du fichier :', err);
            return res.status(500).json({ error: 'Erreur lors de la suppression du fichier.' });
        }

        console.log('Fichier supprimé avec succès :', filePath);
        res.status(200).json({ message: 'Fichier supprimé avec succès.' });
    });
});

// Route API pour obtenir les fichiers et dossiers à la racine
app.get('/api/files', (req, res) => {
    const folderPath = path.join(__dirname, 'uploads');

    fs.readdir(folderPath, { withFileTypes: true }, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur lors de la lecture des fichiers' });
        }

        const folderContent = files.map(file => ({
            name: file.name,
            isDirectory: file.isDirectory()
        }));

        res.json(folderContent);
    });
});

// Route API pour obtenir les fichiers d'un dossier spécifique (chemins multiples)
app.get('/api/files/*', (req, res) => {
    const folderName = req.params[0];
    const safeFolderName = path.normalize(folderName).replace(/^(\.\.(\/|\\|$))+/, '');
    const folderPath = path.join(__dirname, 'uploads', safeFolderName);

    if (!fs.existsSync(folderPath)) {
        return res.status(404).json({ error: 'Dossier non trouvé' });
    }

    fs.readdir(folderPath, { withFileTypes: true }, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur lors de la lecture des fichiers' });
        }

        const folderContent = files.map(file => ({
            name: file.name,
            isDirectory: file.isDirectory()
        }));

        res.json(folderContent);
    });
});

// Route API pour obtenir la liste de tous les dossiers
app.get('/api/folders', (req, res) => {
    const uploadsPath = path.join(__dirname, 'uploads');

    function getAllFolders(dirPath, parentPath = '') {
        let folders = [];
        const files = fs.readdirSync(dirPath, { withFileTypes: true });

        files.forEach(file => {
            if (file.isDirectory()) {
                const relativePath = path.join(parentPath, file.name);
                folders.push(relativePath);
                const subFolders = getAllFolders(path.join(dirPath, file.name), relativePath);
                folders = folders.concat(subFolders);
            }
        });

        return folders;
    }

    try {
        const allFolders = getAllFolders(uploadsPath);
        res.json(allFolders);
    } catch (err) {
        console.error('Erreur lors de la lecture des dossiers :', err);
        res.status(500).json({ error: 'Erreur lors de la lecture des dossiers' });
    }
});

app.post('/api/create-folder', (req, res) => {
    console.log('Requête reçue pour créer un dossier.');

    const folderName = req.body.folderName;
    console.log('Nom du dossier reçu :', folderName);

    const safeFolderName = path.normalize(folderName).replace(/^(\.\.(\/|\\|$))+/, '');
    console.log('Nom du dossier sécurisé :', safeFolderName);

    if (!safeFolderName) {
        console.error('Le nom du dossier est vide ou invalide.');
        return res.status(400).json({ error: 'Le nom du dossier est requis' });
    }

    const folderPath = path.join(__dirname, 'uploads', safeFolderName);
    console.log('Chemin complet du dossier à créer :', folderPath);

    // Vérifier si le dossier existe déjà
    if (fs.existsSync(folderPath)) {
        console.error('Le dossier existe déjà.');
        return res.status(400).json({ error: 'Le dossier existe déjà' });
    }

    // Créer le dossier
    fs.mkdir(folderPath, { recursive: true }, (err) => {
        if (err) {
            console.error('Erreur lors de la création du dossier :', err);
            return res.status(500).json({ error: 'Erreur lors de la création du dossier' });
        }
        console.log('Dossier créé avec succès.');
        res.status(200).json({ message: 'Dossier créé avec succès' });
    });
});

// Route dynamique pour gérer toutes les URL de dossiers, en excluant les routes API
app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Lancer le serveur
app.listen(port, () => {
    console.log(`Serveur démarré sur le port ${port}`);
});