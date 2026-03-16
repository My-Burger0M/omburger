import axios from 'axios';
const token = 'eyJhbGciOiJFUzI1NiIsImtpZCI6IjIwMjYwMzAydjEiLCJ0eXAiOiJKV1QifQ.eyJhY2MiOjEsImVudCI6MSwiZXhwIjoxNzg5NDMxNjEwLCJpZCI6IjAxOWNmNjk2LWU3NjEtNzYzMS04OTMzLTAyMDQyZjkxMmFmMyIsImlpZCI6MTQ1OTU1MTIyLCJvaWQiOjI1MDAwMTQ2MCwicyI6MTA3Mzc1MzI3OCwic2lkIjoiMjc2YTU0YWEtMWZmMS00YzA2LWFjZmQtMjE1OWRhN2E4MGZkIiwidCI6ZmFsc2UsInVpZCI6MTQ1OTU1MTIyfQ.qsprygNDfcpzTg4prxt-OmmoGLLiHxUgh4zQ-eQVCr2nv6S-CdTe63OGQ_yGdWcEcjumSef8Z5aIxg6xEHaZXw';
axios.get('https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=2026-03-01', {
  headers: { 'Authorization': token }
}).then(res => {
  console.log(res.data.length);
  if(res.data.length > 0) console.log(res.data[0]);
}).catch(err => console.error(err.response?.data || err.message));
