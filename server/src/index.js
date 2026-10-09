const { createApp } = require('./app');
const { loadConfig } = require('./config');

const { port } = loadConfig();
const app = createApp();

app.listen(port, () => {
  console.log(`FFCS Maker API listening on :${port}`);
});
