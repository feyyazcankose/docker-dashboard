const express = require('express');
const dotenv = require('dotenv');;
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
dotenv.config();

const app = express();

app.use(express.static('public'));
app.use(bodyParser.json());

// Login endpoint'i
app.post('/login', (req, res) => {
    // Kullanıcı adı ve şifreyi al
    const { username, password } = req.body;
    console.log(process.env.DASHBOARD_ADMIN)
    // Kullanıcı adı ve şifreyi kontrol et
    if (username === process.env.DASHBOARD_ADMIN && password === process.env.DASHBOARD_PASSWORD) {
        // Başarılı ise token oluştur ve gönder
        const token = jwt.sign({ username }, process.env.JWT_SCREET);
        res.json({ token });
    } else {
        // Başarısız ise hata gönder
        res.status(401).json({ error: 'Invalid username or password' });
    }
});


// Diğer endpoint'ler için JWT doğrulama middleware'i
function authenticateToken(req, res, next) {
    const token = req.headers.authorization.split('Bearer ')[1]
    if (!token) return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SCREET, (err, user) => {
        if (err) {
            console.error('JWT verification error:', err);
            return res.sendStatus(403);
        }
        req.user = user;
        next();
    });
}

// JWT doğrulama gerektiren endpoint
app.post('/execute-docker-commands', authenticateToken, (req, res) => {
    // Token doğrulandıktan sonra işlemleri gerçekleştir
    const project = req.body.project;

    // Parametre kontrolü
    if (!project || !project.registry_name || !project.service_name) {
        return res.status(400).send('Invalid request. registry_name and service_name are required.');
    }

    // Komutları oluştur
    const pullCommand = `docker pull registry.digitalocean.com/turassist/${project.registry_name}_prod:latest`;
    const scaleDownCommand = `docker service scale ${project.service_name}=0`;
    const scaleUpCommand = `docker service scale ${project.service_name}=1`;
    const clearCommandImages = `docker image prune`;
    // Komutları sırayla çalıştır
    runCommand(pullCommand)
        .then(() => runCommand(scaleDownCommand))
        .then(() => runCommand(scaleUpCommand))
        .then(() => runCommand(clearCommandImages))
        .then(() => res.send('Transactions completed successfully'))
        .catch(error => res.status(500).send(`Error: ${error}`));
});

app.get('/api/get-docker-logs/:repository/', async (req, res) => {
    try {
        const repository = req.params.repository;
        const tag = "latest";

        // Docker Image ID'sini bulma
        const getImageIdCmd = `docker image inspect registry.digitalocean.com/turassist/${repository}_prod:${tag} --format='{{.Id}}'`;
        const imageId = await executeShellCommand(getImageIdCmd);


        // Docker Container ID ve adını bulma
        const getContainerIdCmd = `docker ps --filter ancestor=${imageId.split("sha256:")[1]} --format "{{.ID}} {{.Names}}"`;
        const containerInfo = await executeShellCommand(getContainerIdCmd);

        // Logları alma
        if (containerInfo) {
            const [containerId, containerName] = containerInfo.split(' ');

            const getLogsCmd = `docker logs ${containerId}`;
            const logs = await executeShellCommand(getLogsCmd);

            console.log(logs);

            res.json({ logs, containerId, containerName });
        } else {
            res.status(404).json({ error: 'Belirtilen repository ve tag ile eşleşen bir container bulunamadı.' });
        }
    } catch (error) {
        res.status(500).json({ error: `Hata: ${error.message}` });
    }
});

function runCommand(command) {
    return new Promise((resolve, reject) => {
        console.log(`Running Command: ${command}`);

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${error.message}`);
                reject(error.message);
            } else {
                console.log(`Çıktı: ${stdout}`);
                resolve();
            }
        });
    });
}

// Shell komutlarını çalıştırmak için yardımcı fonksiyon
function executeShellCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout.trim());
            }
        });
    });
}


app.listen(process.env.APP_PORT, () => {
    console.log(`App ${process.env.APP_URL}:${process.env.APP_PORT} Works at`);
});
