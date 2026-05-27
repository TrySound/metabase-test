const express = require('express');
const app = express();

const data = JSON.parse(require('fs').readFileSync('data.json', 'utf-8'));

app.use(function (req, res, next) {
    const { term } = req.query;
    const delay = term === 'ros' ? 3400 : 0;
    setTimeout(next, delay);
});

app.get('/ping', function (req, res) {
    return res.send(`OK ${Date.now()}`);
});

let lastTimestamp = Date.now();

app.get('/search', function (req, res) {
    const now = Date.now();
    const elapsed = now - lastTimestamp;
    lastTimestamp = now;
    if (elapsed < 100) {
        return res.sendStatus(429);
    }

    const { term } = req.query;
    if (!term) {
        return res.json(data);
    }
    const q = term.toLowerCase();
    const match = ({ name }) => name.toLowerCase().indexOf(q) >= 0;
    const result = data.filter(match);
    return res.json(result);
});

app.listen(process.env.PORT || 8080);