// Aplica as migrações do banco manualmente (o servidor também aplica sozinho ao iniciar).
const { conectar, encerrar } = require('../db');
conectar().then(() => console.log('Banco atualizado.')).catch(e => { console.error(e.message); process.exitCode = 1; }).finally(encerrar);
