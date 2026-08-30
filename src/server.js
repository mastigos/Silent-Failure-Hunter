const express = require('express');
const app = express();
app.use(express.json());

app.use('/', require('./routes/profile'));
app.use('/admin', require('./routes/admin'));
app.use('/leaderboard', require('./routes/leaderboard'));
app.use('/pricing', require('./routes/pricing'));

app.get('/', (req, res) => res.json({ status: 'quiet-fail-demo running' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Demo app listening on port ${PORT}`));
