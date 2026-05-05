import http from 'http';

const url = 'http://localhost:3002/api/facturacion/contexto?ingresoId=16';
console.log('Fetching:', url);

const req = http.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Status:', res.statusCode);
      if (json.data?.prestaciones) {
        const pracs = json.data.prestaciones.filter(p => p.tipo === 'PRACTICA').slice(0, 5);
        console.log('Practices:', JSON.stringify(pracs.map(p => ({uid: p.uid, importeTotal: p.importeTotal, precioUnitario: p.precioUnitario}))));
      } else if (json.error) {
        console.log('Error:', json.error);
      } else {
        console.log('Response:', JSON.stringify(json).substring(0, 500));
      }
    } catch (e) {
      console.log('Parse error:', e.message);
      console.log('Body:', data.substring(0, 300));
    }
  });
});
req.on('error', e => console.error('Request error:', e.message));
