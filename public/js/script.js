/* ================================================================
   Painel do Consórcio — front-end
   Estrutura com barra lateral (Dashboard / Pipeline / Leads / Tarefas),
   inspirada no CRM Foco, mantendo tudo que já existia (MongoDB via
   API REST, modo noturno, cor de destaque, WhatsApp, arraste de cards).
================================================================ */

const API_BASE = '/api';

/* ---------- PWA: registra o service worker (instalável no celular) ---------- */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('/sw.js').catch(()=>{ /* sem problema, o app funciona normal sem isso */ });
  });
}

/* ---------- helpers ---------- */
const fmtBRL = (n) => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', minimumFractionDigits:2, maximumFractionDigits:2 }).format(n || 0);
const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_CHEIO = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const currentMonthKey = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
// Acha a segunda-feira da semana de uma data, no formato "YYYY-MM-DD" — usado como
// identificador de cada semana do GEROT.
function inicioDaSemana(data){
  const d = new Date(data);
  const diaSemana = d.getDay(); // 0=domingo, 1=segunda, ...
  const deslocamento = diaSemana === 0 ? -6 : 1 - diaSemana; // volta até a segunda-feira daquela semana
  d.setDate(d.getDate() + deslocamento);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
const monthLabel = (key, full=false) => {
  if(!key) return '';
  const [y,m] = key.split('-').map(Number);
  const arr = full ? MESES_CHEIO : MESES_ABREV;
  return full ? `${arr[m-1]} de ${y}` : `${arr[m-1]}/${y}`;
};
const maskInteiro = (raw) => {
  const digits = String(raw).replace(/\D/g,'');
  if(!digits) return { numero:0, texto:'' };
  const numero = parseInt(digits,10);
  return { numero, texto: numero.toLocaleString('pt-BR') };
};
const esc = (s='') => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function formatDate(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { timeZone:'UTC' });
}

// Monta o link wa.me a partir do telefone digitado (aceita com ou sem DDI 55)
function waLink(telefone){
  let digitos = String(telefone||'').replace(/\D/g,'');
  if(!digitos) return null;
  if(digitos.length <= 11) digitos = '55' + digitos; // assume Brasil se não veio com DDI
  return `https://wa.me/${digitos}`;
}
function abrirWhatsapp(telefone){
  const link = waLink(telefone);
  if(link) window.open(link, '_blank', 'noopener');
}
const WA_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.36 2 11.75c0 1.87.52 3.62 1.42 5.12L2 22l5.3-1.38a10.4 10.4 0 0 0 4.7 1.13c5.52 0 10-4.36 10-9.75S17.52 2 12 2Zm5.3 13.88c-.23.62-1.32 1.2-1.82 1.24-.47.05-.9.22-3.02-.63-2.56-1.03-4.2-3.63-4.33-3.8-.13-.17-1.03-1.34-1.03-2.56 0-1.21.65-1.8.88-2.05.23-.24.5-.3.67-.3.17 0 .33 0 .48.01.16.01.36-.06.56.42.23.55.77 1.9.84 2.04.07.14.11.3.02.48-.09.17-.14.28-.27.43-.13.15-.28.33-.4.45-.13.13-.27.27-.12.53.16.27.7 1.13 1.5 1.83 1.03.9 1.9 1.18 2.17 1.31.27.13.43.11.59-.07.16-.18.68-.77.87-1.03.18-.27.36-.22.6-.13.24.09 1.55.72 1.82.85.27.13.45.2.51.31.07.12.07.65-.16 1.27Z"/></svg>`;

/* ---------- ícones da interface (genéricos, estilo linha) ---------- */
const ICON_DASHBOARD = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>`;
const ICON_PIPELINE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="4.5" height="16" rx="1"/><rect x="9.75" y="4" width="4.5" height="10" rx="1"/><rect x="16.5" y="4" width="4.5" height="13" rx="1"/></svg>`;
const ICON_LEADS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
const ICON_TASKS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
const ICON_COMISSOES = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="16" r="3"/><line x1="19" y1="5" x2="5" y2="19"/></svg>`;
const ICON_SETTINGS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;
const ICON_SPARKLE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6L12 2Z"/><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z"/><path d="M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z"/></svg>`;
const ICON_BELL = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
const ICON_BUSCA = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
const ICON_CONVERSAS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
const ICON_DISPAROS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
const ICON_RELATORIOS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
const ICON_SUPORTE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
const ICON_CHAT_INTERNO = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
const ICON_SUPERVISAO = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICON_AUTOMACOES = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
const ICON_FLUXOS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="12" r="2"/><path d="M5 8v8"/><path d="M7 6h6a4 4 0 0 1 4 4"/><path d="M7 18h6a4 4 0 0 0 4-4"/></svg>`;
const ICON_AGENDAMENTOS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M12 14v3l2 1"/></svg>`;
const ICON_IMPORT_EXPORT = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 17l-4-4 4-4"/><path d="M4 13h11a4 4 0 0 0 4-4V7"/><path d="M16 7l4 4-4 4"/><path d="M20 11H9a4 4 0 0 0-4 4v2"/></svg>`;
const ICON_LOGOUT = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;
const ICON_EDIT = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>`;
const ICON_REORDER = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>`;
const ICON_FUNNEL = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>`;
const ICON_BAU = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M4 8v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;
const ICON_CANCELAR = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`;
const ICON_REATIVAR = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 12l1.8 1.8L15 10.2"/></svg>`;
const ICON_TRASH = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
const ICON_CHECK = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
const ICON_MOVE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="7 7 3 11 7 15"/><line x1="3" y1="11" x2="15" y2="11"/><polyline points="17 17 21 13 17 9"/><line x1="21" y1="13" x2="9" y2="13"/></svg>`;
const ICON_USERS = ICON_LEADS;
const ICON_DOLLAR = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
const ICON_TROPHY = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 6h2a2 2 0 0 1 0 4h-2"/><path d="M7 6H5a2 2 0 0 0 0 4h2"/></svg>`;
const ICON_TREND = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`;
const ICON_CAMERA = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/></svg>`;

const TEMPS = {
  quente: { label:'Quente', emoji:'🔥', color:'var(--gold-text)', bg:'var(--gold)' },
  morno:  { label:'Morno',  emoji:'☀️', color:'var(--warm)',      bg:'var(--warm-soft)' },
  frio:   { label:'Frio',   emoji:'❄️', color:'var(--cold)',      bg:'var(--cold-soft)' },
};
const TIPOS = {
  aberto:  { label:'Em aberto', color:'var(--ink-soft)', bg:'var(--badge-neutral-bg)' },
  ganho:   { label:'Ganho',     color:'#FFFFFF',         bg:'var(--accent)' },
  perdido: { label:'Perdido',   color:'var(--ink-soft)', bg:'var(--badge-neutral-bg)', strike:true },
};
const PRIORIDADES = {
  alta:  { label:'Alta',  color:'var(--gold-text)', bg:'var(--gold)' },
  media: { label:'Média', color:'var(--warm)',       bg:'var(--warm-soft)' },
  baixa: { label:'Baixa', color:'var(--cold)',       bg:'var(--cold-soft)' },
};

/* ---------- cor de destaque personalizável ---------- */
const ACCENT_PRESETS = ['#141414', '#1D4E89', '#1F4D3A', '#6E1E2B', '#9C6B12', '#4A2E6F'];
function getAccentColor(){ return localStorage.getItem('accentColor') || ACCENT_PRESETS[0]; }
function setAccentColor(cor){
  localStorage.setItem('accentColor', cor);
  document.documentElement.style.setProperty('--accent', cor);
}
document.documentElement.style.setProperty('--accent', getAccentColor());

/* ---------- modo noturno ---------- */
function getDarkMode(){ return localStorage.getItem('darkMode') === '1'; }
function setDarkMode(ligado){
  localStorage.setItem('darkMode', ligado ? '1' : '0');
  document.documentElement.setAttribute('data-theme', ligado ? 'dark' : 'light');
}
setDarkMode(getDarkMode());

/* ---------- nome do site (fixo) ---------- */
document.title = 'Painel CRM';

/* ---------- sessão / login ---------- */
function getToken(){ return localStorage.getItem('token'); }
function getCurrentUser(){
  try{ return JSON.parse(localStorage.getItem('user') || 'null'); }
  catch(e){ return null; }
}
function logout(){
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}

/* Sem token, nem tenta carregar o painel — manda direto pro login */
if(!getToken()){
  window.location.href = 'login.html';
}

/* ---------- estado ---------- */
let currentUser = getCurrentUser();
let board = { columns: [], cards: [] };
let tasks = [];
let loaded = false;
let tasksLoaded = false;
let errorMsg = null;
let currentPage = 'dashboard';   // 'dashboard' | 'pipeline' | 'leads' | 'tarefas'
let filterMonth = currentMonthKey();  // começa no mês atual ao entrar no site — null seria "Geral"
let filtroEsfriando = false;
let dashboardPeriod = 'mes';     // '7dias' | 'mes' | 'trimestre' | 'ano'
let metaVendasValor = 0;
let metaVendasCarregada = false;
let editandoMetaVendas = false;
let metaVendasEquipeValor = 0;
let metaVendasEquipeVendido = 0;
let metaVendasEquipeCarregada = false;
let editandoMetaVendasEquipe = false;
let addingCol = false;
let newColNameVal = '';
let newColTipoVal = 'aberto';
let editingColId = null;
let editingColName = '';
let openMenuColId = null;
let openMoveMenuCardId = null;
let dateMenuOpen = false;
let leadsSearch = '';
let leadsStatusFilter = '';
let leadsOrdenarPor = 'padrao'; // 'padrao' | 'alfabetica' | 'recentes' | 'data-inicio' | 'data-venda'
let pipelineOrdenarPor = 'padrao';
let pipelineOrdenando = false;
let comissoesOrdenarPor = 'padrao';
let ordenarMenuAberto = null; // 'leads' | 'pipeline' | 'comissoes' | null
let mostrarArquivados = false;
let leadsSelecionados = new Set();
let leadsBulkEtiquetaAberta = false;
let leadsBulkEtiquetaValor = '';
let tarefasShowConcluidas = false;
let agendaMesAtual = currentMonthKey();
let agendaLoaded = false;
let agendaTarefas = [];
let agendaEventosGoogle = [];
let agendaDiaSelecionado = null;
let tarefaCopiada = null; // { titulo, prioridade, leadId, descricao } — sem data/hora, que são escolhidas ao colar
let modoSelecaoMultipla = false;
let horariosSelecionados = new Set(); // horas ("09:00" etc.) marcadas pra colar de uma vez, no modo de seleção múltipla
let diaAgendaCopiado = null; // { origemISO, tarefas:[{id,tipo,titulo,prioridade,leadId,descricao,hora}], modo:'copiar'|'mover' } — cópia/corte do dia inteiro
let longPressTimer = null;
let cardTouchDrag = null; // { cardId, cardEl, btn, arrastando, ultimoX, ultimoY, fantasmaEl } — arrastar card no Pipeline por toque, iniciado pela alcinha
let autoScrollDoArrastoInterval = null;
let arrastoRafPendente = false; // limita o trabalho pesado do arrastar a 1x por quadro de tela
let assistenteBolhaX = null; // null = fica na posição padrão (canto inferior direito) até a pessoa arrastar
let assistenteBolhaY = null;
let assistenteAberto = false;
let assistenteMensagens = [];
let assistenteEnviando = false;
let assistenteDrag = null; // { startX, startY, bolhaXInicial, bolhaYInicial, moveu, pointerId }
try{
  const posSalva = JSON.parse(localStorage.getItem('assistente-bolha-pos')||'null');
  if(posSalva && typeof posSalva.x==='number' && typeof posSalva.y==='number'){
    assistenteBolhaX = posSalva.x; assistenteBolhaY = posSalva.y;
  }
}catch(e){}
let menuDiaAberto = null; // { diaISO, x, y } — dia com o menu de copiar/mover aberto, ou null
let checklistDiaModal = null; // { diaISO, modo, marcados:Set } — telinha de escolher quais itens do dia entram na cópia/mover
let longPressDisparou = false; // marca que o menu já abriu pelo toque, pra ignorar o "click" fantasma que o touch dispara em seguida
let calendarConnected = false;
let calendarSyncing = false;
// Integrações que dependem de credenciais do servidor (não do usuário) — otimista por
// padrão (tudo true) até a checagem real chegar, pra nunca esconder nada à toa por causa
// de uma resposta lenta. Ver server/routes/config.js.
let integracoesConfig = { googleAgenda:true, assistenteIA:true, whatsappWebhook:true, instagramWebhook:true, telegramAlerta:true };
let icsStatus = null; // { ativo, url } — link de agenda (.ics), alternativa ao Google Agenda
let icsCarregando = false;
let icsGerando = false;
let whatsappConnected = false;
let whatsappSalvando = false;
let whatsappConfigMsg = null;
let agenteIaAtivo = false;
let iaProativaAtiva = false;
let agendamentos = [];
let agendamentosContagem = { pendente:0, enviada:0, cancelada:0, falhou:0 };
let agendamentosLoaded = false;
let agendamentoModalForm = null;
let agendamentoSalvando = false;
let agendamentoMsg = null;
let menuTriagem = { ativo:false, mensagemInicial:'', opcoes:[] };
let menuTriagemCarregado = false;
let menuTriagemSalvando = false;
let menuTriagemMsg = null;
let instagramConnected = false;
let instagramSalvando = false;
let instagramConfigMsg = null;
let conversas = [];
let conversasLoaded = false;
let conversaSelecionadaCardId = null;
let conversaMensagens = [];
let conversaMensagensLoaded = false;
let conversaTexto = '';
let conversaEnviando = false;
let conversaBusca = '';
let conversasOverlay = null; // null | 'automacoes' | 'disparos' | 'agendamentos'
let conversaPollingTimer = null;
let notifOpen = false;
let buscaGlobalAberta = false;
let buscaGlobalTexto = '';
let camposPersonalizados = [];
let camposPersonalizadosCarregados = false;
let novoCampoNome = '';
let novoCampoTipo = 'texto';
let camposPersonalizadosMsg = null;
let webhooksSaida = [];
let webhooksSaidaMsg = null;
let agendamentoPublicoMsg = null;
let agendamentoPublicoForm = {
  ativo: (currentUser && currentUser.agendamentoPublico && currentUser.agendamentoPublico.ativo) || false,
  horaInicio: (currentUser && currentUser.agendamentoPublico && currentUser.agendamentoPublico.horaInicio) || '08:00',
  horaFim: (currentUser && currentUser.agendamentoPublico && currentUser.agendamentoPublico.horaFim) || '18:00',
  duracaoMinutos: (currentUser && currentUser.agendamentoPublico && currentUser.agendamentoPublico.duracaoMinutos) || 30,
  diasSemana: (currentUser && currentUser.agendamentoPublico && currentUser.agendamentoPublico.diasSemana) || [1,2,3,4,5],
  colunaDestinoId: (currentUser && currentUser.agendamentoPublico && currentUser.agendamentoPublico.colunaDestinoId) || '',
};
const ROTULOS_EVENTOS_WEBHOOK = {
  'lead.criado': 'Novo lead criado',
  'lead.movido': 'Lead mudou de coluna',
  'lead.ganho': 'Lead marcado como ganho',
  'mensagem.recebida': 'Mensagem recebida no WhatsApp',
  'tarefa.criada': 'Nova tarefa criada',
};
let anexosDoCard = [];
let historicoContatoCarregado = false;
let historicoContatoItens = [];
let historicoContatoTexto = '';
let historicoContatoEnviando = false;
let tarefasRapidasLista = [{ titulo:'', data:'' }]; // sempre começa com uma linha vazia
let tarefaRapidaCriando = false;
let salvandoCard = false;
let mensagemSalvoCard = null; // texto da mensagem "Novo lead adicionado" enquanto ela anima
let salvandoTask = false;
let extrasTela = null; // null (fechado) | 'menu' | 'etiquetas' | 'anexos' | 'tarefas' | 'tarefas-lista' | 'historico'
let etiquetaInputValor = '';
let etiquetaEditandoOriginal = null; // texto original da etiqueta sendo editada, ou null se for uma nova
let tarefasDoLeadCarregadas = false;
let tarefasDoLead = [];
let agendaDiaDestacado = null; // dia (YYYY-MM-DD) marcado com a cor de destaque, ao vir de um clique numa tarefa
let historicoContatoEditandoId = null;
let anexosCarregados = false;
let anexoEnviando = false;
let anexoMsg = null;
let possiveisLeads = [];
let possiveisLeadsCarregados = false;
let importPlanilhaLinhas = [];
let importPlanilhaColunas = [];
let importPlanilhaNomeArquivo = '';
let importMapNome = '';
let importMapTelefone = '';
let importMapServico = '';
let importandoPlanilha = false;
let importPlanilhaMsg = null;
let completarLeadModalForm = null;
let completarLeadSalvando = false;
let completarLeadMsg = null;
let propostaModalForm = null;
let twoFactorSetup = null; // { segredo, otpauthUri } enquanto configurando
let twoFactorMsg = null;
let twoFactorSalvando = false;
let mostrarDesativar2FA = false;
let auditoriaEventos = [];
let auditoriaCarregada = false;
let auditoriaExpandida = false;
let configCategoriaAtiva = 'perfil';
let monitoramentoLoaded = false;
let monitoramentoErros = [];
let disparoFiltroColuna = '';
let disparoFiltroTemp = '';
let disparoSelecionados = new Set();
let disparoTexto = '';
let disparoEnviando = false;
let disparoResultado = null;
let disparoUsarTemplate = false;
let disparoTemplateNome = '';
let disparoTemplateIdioma = 'pt_BR';
let disparoTemplateVariaveis = '';
let disparoTemplatesDisponiveis = [];
let templatesList = [];
let templatesCarregados = false;
let templatesSincronizando = false;
let templatesMsg = null;
let templateModalForm = null;
let templateSalvando = false;
let templateMsg = null;
let funis = [];
let funisLoaded = false;
let funilAtualId = null;
let editingFunilId = null;
let editingFunilName = '';
let relatorioFunilId = '';
let equipe = null;
let equipeLoaded = false;
let equipeNomeNovo = '';
let equipeCodigoEntrar = '';
let equipeMsg = null;
let equipeSubTab = 'chat';
let agendaSubTab = 'calendario';
let gerotSemanaAtual = inicioDaSemana(new Date());
let gerotBlocos = [];
let gerotLoaded = false;
let gerotCopiando = false;
let gerotEditor = null; // { diaSemana, horarioInicio, horarioFim, texto, blocoId (se editando um existente) } ou null se fechado
let gerotSalvandoErro = null;
let gerotImportando = false;
let gerotImportMsg = null;
let chatMensagens = [];
let chatLoaded = false;
let chatTexto = '';
let chatEnviando = false;
let dmDestinatarioId = null;
let dmMensagens = [];
let dmLoaded = false;
let dmTexto = '';
let dmEnviando = false;
let supervisaoMembros = [];
let supervisaoLoaded = false;
let visualizandoDashboardDe = null; // { userId, nome } | null — quando setado, o Dashboard mostra os dados desse membro, em modo leitura
let boardBackupGestor = null;
let tasksBackupGestor = null;
let metaVendasValorBackupGestor = null;
let automacoes = [];
let automacoesLoaded = false;
let automacaoModalForm = null;
let fluxos = [];
let fluxosLoaded = false;
let fluxoModalForm = null;
let colunaLeadsPickerColId = null;
let colunaLeadsPickerModo = 'transferir';
let colunaLeadsSelecionados = new Set();
let colunaLeadsMovendo = false;
let contratos = [];
let contratosLoaded = false;
let comissoesMonth = currentMonthKey();
let contratoModalForm = null;
let regrasComissao = [];
let regrasComissaoLoaded = false;
let regrasModalAberto = false; // lista de regras de comissão (abre pela engrenagem em Comissões)
let regraEditForm = null; // editor de uma regra específica, dentro do modal de regras
let nomeNovoVal = '';
let nomeMsg = null;
let verificandoAtualizacao = false;
let preenchendoMesInicioContato = false;
let mesInicioContatoMsg = null;
let backupGerando = false;
let backupImportando = false;
let backupMsg = null;
let backupModalAberto = false;
let atualizacaoMsg = null;
let nomeSalvando = false;
let modalAlterarNomeAberto = false;
let logoutAllMsg = null;
let logoutAllEnviando = false;
let avatarSalvando = false;
let avatarMsg = null;
let modalEditarPerfilAberto = false; // escolha entre "adicionar foto" e "editar nome", em Seu perfil
let avatarLightboxAberto = false; // visualização grande da foto atual (aberta via toque-e-segure)
let avatarPressTimer = null; // controla o toque-e-segure no avatar/ícone de câmera
let avatarPressDisparou = false; // marca que o toque-e-segure já abriu a visualização, pra ignorar o "click" fantasma que o touch dispara em seguida
let senhaAtualVal = '';
let senhaNovaVal = '';
let senhaMsg = null; // { tipo:'ok'|'erro', texto }
let senhaSalvando = false;
let modalAlterarSenhaAberto = false;
let importColumnId = null;
let importResultado = null; // { sucesso, falha }
let importando = false;
let aiInsights = [];
let sidebarOpen = false;
let insightsCarregando = false;
let insightsPipelineExpandido = false;
let modalForm = null;            // objeto do cliente sendo editado/criado
let escolhaTipoPessoaColId = null; // coluna escolhida ao criar lead novo, enquanto a telinha de física/jurídica está aberta
let tipoPessoaDropdownAberto = false; // dropdown de física/jurídica, dentro do modal do lead
let taskModalForm = null;        // objeto da tarefa sendo editada/criada
let eventoGoogleModalForm = null; // { eventId, titulo, data, hora } — edita o evento direto na fonte, no Google
let confirmState = null;         // { message, onConfirm }

/* ---------- comunicação com a API ---------- */
async function apiRequest(method, path, body, timeoutMs){
  const opts = { method, headers: {} };
  const token = getToken();
  if(token) opts.headers['Authorization'] = 'Bearer ' + token;
  if(body !== undefined){
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(()=> controller.abort(), timeoutMs || 25000); // 25s por padrão — evita a tela travar pra sempre esperando o servidor
  opts.signal = controller.signal;
  let res;
  try{
    res = await fetch(API_BASE + path, opts);
  }catch(e){
    if(e.name === 'AbortError'){
      throw new Error('O servidor demorou demais pra responder. Tente de novo em alguns segundos.');
    }
    throw new Error('Não foi possível conectar ao servidor. Confira sua internet e tente de novo.');
  }finally{
    clearTimeout(timeoutId);
  }
  if(res.status === 401){
    logout();
    throw new Error('Sessão expirada.');
  }
  if(!res.ok){
    let msg = 'Erro na requisição ao servidor';
    try{ const data = await res.json(); if(data && data.error) msg = data.error; }catch(e){}
    throw new Error(msg);
  }
  if(res.status === 204) return null;
  return res.json();
}

/* ---------- carregamento inicial ---------- */
async function loadBoard(){
  try{
    const data = await apiRequest('GET', '/board');
    board = { columns: data.columns, cards: data.cards };
    errorMsg = null;
  }catch(e){
    board = { columns: [], cards: [] };
    errorMsg = 'Não foi possível carregar os dados do servidor. Verifique se a API e o MongoDB estão rodando.';
  }
  loaded = true;
  renderApp();
}

/* ---------- funis (múltiplos pipelines) ---------- */
async function loadFunis(){
  try{
    const data = await apiRequest('GET', '/funis');
    funis = data.funis || [];
    if((!funilAtualId || !funis.some(f=>f.id===funilAtualId)) && funis.length){
      funilAtualId = funis[0].id;
    }
  }catch(e){
    funis = [];
  }
  funisLoaded = true;
  renderApp();
}
async function criarNovoFunil(){
  try{
    const novo = await apiRequest('POST', '/funis', { nome: 'Novo funil' });
    funis.push(novo);
    funilAtualId = novo.id;
  }catch(e){
    errorMsg = 'Não foi possível criar o funil.';
  }
  renderApp();
}
async function renomearFunil(id, nome){
  const f = funis.find(x=>x.id===id);
  if(!f) return;
  const nomeFinal = nome.trim() || f.nome;
  const anterior = f.nome;
  f.nome = nomeFinal;
  renderApp();
  try{
    await apiRequest('PUT', `/funis/${id}`, { nome: nomeFinal });
  }catch(e){
    f.nome = anterior;
    errorMsg = 'Não foi possível renomear o funil.';
    renderApp();
  }
}
async function duplicarFunil(id){
  const original = funis.find(f=>f.id===id);
  try{
    const novoFunil = await apiRequest('POST', `/funis/${id}/duplicar`);
    funis.push(novoFunil);
    funilAtualId = novoFunil.id;
    await loadBoard(); // recarrega colunas/cards pra pegar as colunas novas criadas no servidor
  }catch(e){
    errorMsg = `Não foi possível duplicar o funil${original?` "${original.nome}"`:''}.`;
    renderApp();
  }
}
async function excluirFunil(id){
  const idx = funis.findIndex(f=>f.id===id);
  if(idx===-1) return;
  const [removido] = funis.splice(idx,1);
  const colunasRemovidas = board.columns.filter(c=>c.funilId===id);
  const colunaIds = new Set(colunasRemovidas.map(c=>c.id));
  const cardsRemovidos = board.cards.filter(c=>colunaIds.has(c.columnId));
  board.columns = board.columns.filter(c=>c.funilId!==id);
  board.cards = board.cards.filter(c=>!colunaIds.has(c.columnId));
  if(funilAtualId === id) funilAtualId = funis.length ? funis[0].id : null;
  renderApp();
  try{
    await apiRequest('DELETE', `/funis/${id}`);
  }catch(e){
    funis.splice(idx,0,removido);
    board.columns.push(...colunasRemovidas);
    board.cards.push(...cardsRemovidos);
    if(!funis.some(f=>f.id===funilAtualId)) funilAtualId = removido.id;
    errorMsg = 'Não foi possível excluir o funil.';
    renderApp();
  }
}

async function loadTasks(){
  try{
    const data = await apiRequest('GET', '/tasks');
    tasks = data.tasks;
  }catch(e){
    tasks = [];
  }
  tasksLoaded = true;
  renderApp();
}
function copiarTarefa(taskId, elemento){
  const t = tasks.find(x=>x.id===taskId) || agendaTarefas.find(x=>x.id===taskId);
  if(!t) return;
  tarefaCopiada = { titulo: t.titulo, prioridade: t.prioridade, leadId: t.leadId||null, descricao: t.descricao||'', hora: horaLocalDaTarefaOuNull(t.vencimento) };
  if(navigator.vibrate) navigator.vibrate(15);
  if(elemento) mostrarPopupRapido(elemento, 'Copiado');
  renderApp();
  if(agendaDiaSelecionado) renderAgendaDiaModalPreservandoScroll();
}
function copiarEvento(eventoId, elemento){
  const e = agendaEventosGoogle.find(x=>x.id===eventoId);
  if(!e) return;
  const hora = horaLocalDoEventoOuNull(e);
  tarefaCopiada = { titulo: e.titulo, prioridade: e.prioridade||'media', leadId: e.leadId||null, descricao: e.descricao||'', hora };
  if(navigator.vibrate) navigator.vibrate(15);
  if(elemento) mostrarPopupRapido(elemento, 'Copiado');
  renderApp();
  if(agendaDiaSelecionado) renderAgendaDiaModalPreservandoScroll();
}

// Extrai a hora local (HH:MM) de uma tarefa, ou null se ela não tiver horário definido —
// mesma checagem em UTC usada no resto do sistema, pra tarefa sem hora não "ganhar" hora à toa.
function horaLocalDaTarefaOuNull(vencimentoIso){
  const d = new Date(vencimentoIso);
  if(isNaN(d.getTime()) || (d.getUTCHours()===0 && d.getUTCMinutes()===0)) return null;
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
// Mesma ideia, mas pra evento do Google — que já vem com a flag diaInteiro explícita,
// em vez de precisar inferir pela meia-noite UTC como a tarefa.
function horaLocalDoEventoOuNull(evento){
  if(evento.diaInteiro || !evento.inicio) return null;
  const d = new Date(evento.inicio);
  if(isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
// Mostra um aviso rápido (1s, some sozinho) colado em cima de um elemento —
// usado pra confirmar "copiado!" sem precisar de uma mensagem fixa na tela.
function mostrarPopupRapido(elemento, texto){
  let root = document.getElementById('popup-rapido-root');
  if(!root){
    root = document.createElement('div');
    root.id = 'popup-rapido-root';
    document.body.appendChild(root);
  }
  const rect = elemento.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'popup-rapido';
  el.textContent = texto;
  el.style.top = `${rect.top + rect.height/2}px`;
  el.style.left = `${rect.left + rect.width/2}px`;
  root.appendChild(el);
  requestAnimationFrame(()=> el.classList.add('popup-rapido-visivel'));
  setTimeout(()=>{
    el.classList.remove('popup-rapido-visivel');
    setTimeout(()=> el.remove(), 250);
  }, 1000);
}
// Liga o gesto de copiar (botão direito no computador, apertar e segurar em touch)
// num conjunto de elementos — reaproveitado tanto nas linhas do dia quanto, antes,
// nas células do calendário mensal.
function ligarGestoDeCopiar(elementos, callback){
  elementos.forEach(el=>{
    el.addEventListener('contextmenu', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      callback(el);
    });
    el.addEventListener('touchstart', ()=>{
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(()=>{
        longPressDisparou = true;
        callback(el);
      }, 550);
    }, { passive:true });
    el.addEventListener('touchend', (e)=>{ e.stopPropagation(); clearTimeout(longPressTimer); });
    el.addEventListener('touchmove', ()=> clearTimeout(longPressTimer));
    el.addEventListener('touchcancel', ()=> clearTimeout(longPressTimer));
  });
}
// Menuzinho de "Copiar" ou "Mover" — abre no clique direito (computador) ou apertar e
// segurar (toque) num dia do calendário. Usa a mesma técnica de raiz flutuante do menu
// "Mover para" do card, pra não ficar preso em nenhum overflow escondido.
function abrirMenuDia(diaISO, x, y){
  const { tarefasDoDia, eventosDoDia } = itensDoDiaAgenda(diaISO);
  if(!tarefasDoDia.length && !eventosDoDia.length) return; // dia vazio, nada pra copiar/mover
  menuDiaAberto = { diaISO, x, y };
  renderFloatingMenuDia();
}
function fecharMenuDia(){
  menuDiaAberto = null;
  renderFloatingMenuDia();
}
function renderFloatingMenuDia(){
  let root = document.getElementById('menu-dia-root');
  if(!root){
    root = document.createElement('div');
    root.id = 'menu-dia-root';
    document.body.appendChild(root);
  }
  if(!menuDiaAberto){ root.innerHTML = ''; return; }
  const { diaISO, x, y } = menuDiaAberto;
  const left = Math.min(x, window.innerWidth - 180);
  const top = Math.min(y, window.innerHeight - 100);
  root.innerHTML = `
    <div class="col-menu" style="position:fixed; top:${Math.max(4,top)}px; left:${Math.max(4,left)}px; min-width:170px;">
      <button class="col-menu-item" data-action="menu-dia-copiar">Copiar</button>
      <button class="col-menu-item" data-action="menu-dia-mover">Mover</button>
    </div>
  `;
  const cel = document.querySelector(`[data-action="abrir-dia-agenda"][data-dia="${diaISO}"]`);
  const copiarBtn = root.querySelector('[data-action="menu-dia-copiar"]');
  if(copiarBtn) copiarBtn.addEventListener('click', ()=>{ abrirChecklistDia(diaISO, 'copiar'); fecharMenuDia(); });
  const moverBtn = root.querySelector('[data-action="menu-dia-mover"]');
  if(moverBtn) moverBtn.addEventListener('click', ()=>{ abrirChecklistDia(diaISO, 'mover'); fecharMenuDia(); });
}
// Telinha de checklist — escolher exatamente quais tarefas/eventos do dia entram na
// cópia/mover, em vez de pegar tudo automaticamente.
function abrirChecklistDia(diaISO, modo){
  const { tarefasDoDia, eventosDoDia } = itensDoDiaAgenda(diaISO);
  const todosIds = [...tarefasDoDia.map(t=>t.id), ...eventosDoDia.map(e=>e.id)];
  if(!todosIds.length) return;
  checklistDiaModal = { diaISO, modo, marcados: new Set(todosIds) }; // começa com tudo marcado — desmarca o que não quiser
  renderChecklistDiaModal();
}
function fecharChecklistDia(){
  checklistDiaModal = null;
  document.getElementById('modal-root').innerHTML = '';
}
function renderChecklistDiaModal(){
  const root = document.getElementById('modal-root');
  if(!checklistDiaModal){ root.innerHTML = ''; return; }
  const { diaISO, modo, marcados } = checklistDiaModal;
  const { tarefasDoDia, eventosDoDia } = itensDoDiaAgenda(diaISO);
  const dataLabel = new Date(diaISO+'T00:00:00').toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });
  const itens = [
    ...tarefasDoDia.map(t=>({ id:t.id, titulo:t.titulo, hora:horaLocalDaTarefaOuNull(t.vencimento), icone:'✓' })),
    ...eventosDoDia.map(e=>({ id:e.id, titulo:e.titulo, hora:horaLocalDoEventoOuNull(e), icone:'📅' })),
  ];

  root.innerHTML = `
    <div class="overlay" id="checklist-dia-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3 style="text-transform:capitalize;">${modo==='mover'?'Mover':'Copiar'} itens — ${esc(dataLabel)}</h3>
          <button id="checklist-dia-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="settings-btn-row" style="margin-bottom:10px;">
            <button class="btn-outline" id="checklist-marcar-todos">Marcar todos</button>
            <button class="btn-outline" id="checklist-desmarcar-todos">Desmarcar todos</button>
          </div>
          <div class="checklist-dia-lista">
            ${itens.map(it=>`
              <label class="checklist-dia-item">
                <input type="checkbox" class="checklist-dia-checkbox" data-item-id="${it.id}" ${marcados.has(it.id)?'checked':''} />
                <span class="checklist-dia-item-texto">${it.icone} ${esc(it.titulo)}</span>
                ${it.hora ? `<span class="checklist-dia-item-hora">${it.hora}</span>` : ''}
              </label>
            `).join('')}
          </div>
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="checklist-dia-cancelar">Cancelar</button>
            <button class="btn-save" id="checklist-dia-confirmar" ${marcados.size===0?'disabled':''}>${modo==='mover'?'Mover':'Copiar'} ${marcados.size} item${marcados.size===1?'':'s'}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('checklist-dia-close').addEventListener('click', fecharChecklistDia);
  document.getElementById('checklist-dia-cancelar').addEventListener('click', fecharChecklistDia);
  document.getElementById('checklist-dia-overlay').addEventListener('click', (e)=>{ if(e.target.id==='checklist-dia-overlay') fecharChecklistDia(); });
  document.getElementById('checklist-marcar-todos').addEventListener('click', ()=>{
    itens.forEach(it=> checklistDiaModal.marcados.add(it.id));
    renderChecklistDiaModal();
  });
  document.getElementById('checklist-desmarcar-todos').addEventListener('click', ()=>{
    checklistDiaModal.marcados.clear();
    renderChecklistDiaModal();
  });
  root.querySelectorAll('.checklist-dia-checkbox').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      if(chk.checked) checklistDiaModal.marcados.add(chk.dataset.itemId);
      else checklistDiaModal.marcados.delete(chk.dataset.itemId);
      renderChecklistDiaModal();
    });
  });
  const confirmarBtn = document.getElementById('checklist-dia-confirmar');
  if(confirmarBtn) confirmarBtn.addEventListener('click', ()=>{
    const marcadosFinal = new Set(checklistDiaModal.marcados);
    const cel = document.querySelector(`[data-action="abrir-dia-agenda"][data-dia="${diaISO}"]`);
    fecharChecklistDia();
    copiarDiaInteiro(diaISO, cel, modo, marcadosFinal);
  });
}
function copiarDiaInteiro(diaISO, elemento, modo, idsIncluidos){
  modo = modo || 'copiar';
  const { tarefasDoDia, eventosDoDia } = itensDoDiaAgenda(diaISO);
  const tarefasFiltradas = idsIncluidos ? tarefasDoDia.filter(t=>idsIncluidos.has(t.id)) : tarefasDoDia;
  const eventosFiltrados = idsIncluidos ? eventosDoDia.filter(e=>idsIncluidos.has(e.id)) : eventosDoDia;
  const itens = [
    ...tarefasFiltradas.map(t=>({
      id: t.id, tipo: 'tarefa', titulo: t.titulo, prioridade: t.prioridade, leadId: t.leadId||null, descricao: t.descricao||'',
      hora: horaLocalDaTarefaOuNull(t.vencimento),
    })),
    ...eventosFiltrados.map(e=>({
      id: e.id, tipo: 'evento', titulo: e.titulo, prioridade: e.prioridade||'media', leadId: e.leadId||null, descricao: e.descricao||'',
      hora: horaLocalDoEventoOuNull(e),
    })),
  ];
  if(!itens.length) return;
  diaAgendaCopiado = { origemISO: diaISO, tarefas: itens, modo };
  if(navigator.vibrate) navigator.vibrate(15);
  if(elemento) mostrarPopupRapido(elemento, `${itens.length} ${modo==='mover'?'marcado':'copiado'}${itens.length===1?'':'s'}`);
  renderApp();
}
async function colarDiaInteiroEm(diaISO, elemento){
  if(!diaAgendaCopiado || diaISO===diaAgendaCopiado.origemISO) return;
  const qtd = diaAgendaCopiado.tarefas.length;
  const modo = diaAgendaCopiado.modo || 'copiar';
  try{
    for(const t of diaAgendaCopiado.tarefas){
      if(modo==='mover'){
        // move de verdade — atualiza a data do próprio item original, sem criar cópia nem apagar nada
        if(t.tipo==='evento'){
          await apiRequest('PUT', `/calendar/eventos/${t.id}`, { titulo:t.titulo, data:diaISO, hora:t.hora||null, descricao:t.descricao, prioridade:t.prioridade, leadId:t.leadId||null });
          const idx = agendaEventosGoogle.findIndex(x=>x.id===t.id);
          if(idx>-1){
            const novoInicio = t.hora ? new Date(`${diaISO}T${t.hora}`).toISOString() : diaISO;
            agendaEventosGoogle[idx] = { ...agendaEventosGoogle[idx], inicio: novoInicio, diaInteiro: !t.hora };
          }
        } else {
          let vencimento = diaISO;
          if(t.hora){
            const combinado = new Date(`${diaISO}T${t.hora}`);
            if(!isNaN(combinado.getTime())) vencimento = combinado.toISOString();
          }
          const atualizada = await apiRequest('PUT', `/tasks/${t.id}`, { titulo:t.titulo, prioridade:t.prioridade, leadId:t.leadId, descricao:t.descricao, vencimento });
          const idxT = tasks.findIndex(x=>x.id===t.id);
          if(idxT>-1) tasks[idxT] = atualizada;
          atualizarTarefaNaAgendaLocal(atualizada);
        }
      } else {
        // copiar — vira sempre uma tarefa nova (evento copiado também vira cópia como tarefa, não duplica o evento em si)
        const dados = { titulo:t.titulo, prioridade:t.prioridade, leadId:t.leadId, descricao:t.descricao, vencimento: diaISO };
        if(t.hora){
          const combinado = new Date(`${diaISO}T${t.hora}`);
          if(!isNaN(combinado.getTime())) dados.vencimento = combinado.toISOString();
        }
        const nova = await apiRequest('POST', '/tasks', dados);
        tasks.push(nova);
        atualizarTarefaNaAgendaLocal(nova);
      }
    }
    diaAgendaCopiado = null; // colar/mover o dia só acontece uma vez — depois disso, a "área de transferência" se esvazia sozinha
    if(elemento) mostrarPopupRapido(elemento, `${qtd} ${modo==='mover'?'movido':'colado'}${qtd===1?'':'s'}`);
    renderApp();
  }catch(e){
    errorMsg = modo==='mover' ? 'Não foi possível mover pra esse dia.' : 'Não foi possível colar nesse dia.';
    renderApp();
  }
}
function cancelarTarefaCopiada(){
  tarefaCopiada = null;
  modoSelecaoMultipla = false;
  horariosSelecionados.clear();
  renderApp();
  if(agendaDiaSelecionado) renderAgendaDiaModalPreservandoScroll();
}
async function colarTarefaEm(diaISO, hora){
  if(!tarefaCopiada) return;
  const { hora: horaOriginal, ...dadosBase } = tarefaCopiada;
  const horaFinal = hora || horaOriginal; // usa a hora do horário clicado; sem isso, cai pra hora original que foi copiada
  const dados = { ...dadosBase, vencimento: diaISO };
  if(horaFinal){
    const combinado = new Date(`${diaISO}T${horaFinal}`);
    if(!isNaN(combinado.getTime())) dados.vencimento = combinado.toISOString();
  }
  try{
    const nova = await apiRequest('POST', '/tasks', dados);
    tasks.push(nova);
    atualizarTarefaNaAgendaLocal(nova);
    renderApp();
  }catch(e){
    errorMsg = 'Não foi possível colar a tarefa.';
    renderApp();
  }
  if(agendaDiaSelecionado) renderAgendaDiaModalPreservandoScroll();
}
async function colarEmHorariosSelecionados(){
  if(!tarefaCopiada || !horariosSelecionados.size || !agendaDiaSelecionado) return;
  const diaISO = agendaDiaSelecionado;
  const { hora: horaOriginal, ...dadosBase } = tarefaCopiada;
  const horarios = [...horariosSelecionados];
  for(const hora of horarios){
    const dados = { ...dadosBase, vencimento: diaISO };
    const combinado = new Date(`${diaISO}T${hora}`);
    if(!isNaN(combinado.getTime())) dados.vencimento = combinado.toISOString();
    try{
      const nova = await apiRequest('POST', '/tasks', dados);
      tasks.push(nova);
      atualizarTarefaNaAgendaLocal(nova);
    }catch(e){
      errorMsg = 'Não foi possível colar em todos os horários selecionados.';
    }
  }
  modoSelecaoMultipla = false;
  horariosSelecionados.clear();
  renderApp();
  if(agendaDiaSelecionado) renderAgendaDiaModal();
}
async function loadGerot(semana){
  gerotLoaded = false;
  renderApp();
  try{
    const data = await apiRequest('GET', `/gerot/${semana}`);
    gerotBlocos = data.blocos || [];
  }catch(e){
    gerotBlocos = [];
  }
  gerotLoaded = true;
  renderApp();
}
function mudarSemanaGerot(delta){
  const [ano,mes,dia] = gerotSemanaAtual.split('-').map(Number);
  const d = new Date(ano, mes-1, dia + delta*7);
  gerotSemanaAtual = inicioDaSemana(d);
  gerotEditor = null;
  loadGerot(gerotSemanaAtual);
}
function abrirGerotEditor(diaSemana, horario, blocoId){
  gerotSalvandoErro = null;
  if(blocoId){
    const b = gerotBlocos.find(x=>x.id===blocoId);
    if(!b) return;
    gerotEditor = { diaSemana, horarioInicio: b.horarioInicio, horarioFim: b.horarioFim, texto: b.texto, blocoId: b.id };
  } else {
    const idxInicio = GEROT_HORARIOS.indexOf(horario);
    const fimPadrao = GEROT_LIMITES[idxInicio+1] || GEROT_LIMITES[GEROT_LIMITES.length-1];
    gerotEditor = { diaSemana, horarioInicio: horario, horarioFim: fimPadrao, texto: '', blocoId: null };
  }
  renderApp();
  const input = document.getElementById('gerot-editor-texto');
  if(input) input.focus();
}
function fecharGerotEditor(){
  gerotEditor = null;
  gerotSalvandoErro = null;
  renderApp();
}
async function salvarGerotEditor(){
  if(!gerotEditor) return;
  const texto = gerotEditor.texto.trim();
  if(!texto){ gerotSalvandoErro = 'Escreva a atividade desse bloco.'; renderApp(); return; }
  try{
    const resultado = await apiRequest('PUT', '/gerot', {
      semanaInicio: gerotSemanaAtual, diaSemana: gerotEditor.diaSemana,
      horarioInicio: gerotEditor.horarioInicio, horarioFim: gerotEditor.horarioFim,
      texto, blocoId: gerotEditor.blocoId,
    });
    const idx = gerotBlocos.findIndex(b=>b.id===resultado.id);
    if(idx>-1) gerotBlocos[idx] = resultado; else gerotBlocos.push(resultado);
    gerotEditor = null;
    gerotSalvandoErro = null;
  }catch(e){
    gerotSalvandoErro = (e && e.message) || 'Não foi possível salvar esse bloco.';
  }
  renderApp();
}
async function apagarGerotEditorAtual(){
  if(!gerotEditor || !gerotEditor.blocoId) return;
  const blocoId = gerotEditor.blocoId;
  try{
    await apiRequest('DELETE', `/gerot/${blocoId}`);
    gerotBlocos = gerotBlocos.filter(b=>b.id!==blocoId);
    gerotEditor = null;
  }catch(e){
    gerotSalvandoErro = 'Não foi possível apagar esse bloco.';
  }
  renderApp();
}
function renderGerotEditorHtml(){
  const ed = gerotEditor;
  const opcoesInicio = GEROT_HORARIOS.map(h=>`<option value="${h}" ${h===ed.horarioInicio?'selected':''}>${h}</option>`).join('');
  const opcoesFim = GEROT_LIMITES.filter(h=>h>ed.horarioInicio).map(h=>`<option value="${h}" ${h===ed.horarioFim?'selected':''}>${h}</option>`).join('');
  return `
    <div class="gerot-editor">
      <p class="settings-page-subtitle">${GEROT_DIAS[ed.diaSemana]} — ${ed.blocoId?'editar bloco':'novo bloco'}</p>
      <div class="field-row-flex">
        <select id="gerot-editor-inicio">${opcoesInicio}</select>
        <span class="settings-page-note">até</span>
        <select id="gerot-editor-fim">${opcoesFim}</select>
      </div>
      <input type="text" id="gerot-editor-texto" value="${esc(ed.texto)}" placeholder="Ex: Prospecção ativa" style="margin-top:10px; width:100%;" />
      ${gerotSalvandoErro ? `<p class="settings-page-note" style="color:var(--danger);">${esc(gerotSalvandoErro)}</p>` : ''}
      <div class="field-row-flex" style="margin-top:12px;">
        <button class="btn-primary" id="gerot-editor-salvar">Salvar</button>
        <button class="btn-outline" id="gerot-editor-cancelar">Cancelar</button>
        ${ed.blocoId ? `<button class="btn-outline" id="gerot-editor-apagar" style="color:var(--danger);">Apagar bloco</button>` : ''}
      </div>
    </div>
  `;
}
function exportarGerotParaPlanilha(){
  const [ano,mes,dia] = gerotSemanaAtual.split('-').map(Number);
  const segunda = new Date(ano, mes-1, dia);
  const datasDaSemana = GEROT_DIAS.map((_,i)=>{ const d = new Date(segunda); d.setDate(d.getDate()+i); return d; });
  const grade = calcularGradeGerot();

  // monta a matriz: linha 0 é o cabeçalho (dias da semana), as demais são os horários
  const dados = [['', ...GEROT_DIAS.map((d,i)=> `${d} (${datasDaSemana[i].toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})})`)]];
  GEROT_HORARIOS.forEach(h => dados.push([h, '', '', '', '', '']));

  const merges = [];
  GEROT_DIAS.forEach((_, diaIdx)=>{
    GEROT_HORARIOS.forEach((horario, linhaIdx)=>{
      const info = grade[diaIdx][horario];
      if(info.tipo === 'inicio'){
        dados[linhaIdx+1][diaIdx+1] = info.bloco.texto; // +1 na linha pq a 0 é cabeçalho, +1 na coluna pq a 0 é o horário
        if(info.rowspan > 1){
          merges.push({ s:{ r:linhaIdx+1, c:diaIdx+1 }, e:{ r:linhaIdx+1+info.rowspan-1, c:diaIdx+1 } });
        }
      }
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(dados);
  ws['!merges'] = merges;
  ws['!cols'] = [{wch:8}, {wch:24}, {wch:24}, {wch:24}, {wch:24}, {wch:24}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'GEROT');
  XLSX.writeFile(wb, `gerot-semana-${gerotSemanaAtual}.xlsx`);
}
async function importarGerotDePlanilha(file){
  if(!file) return;
  gerotImportando = true;
  gerotImportMsg = null;
  renderApp();
  try{
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type:'array' });
    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const dados = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
    const merges = ws['!merges'] || [];

    // limpa os blocos já existentes dessa semana antes de importar, pra não dar
    // conflito de horário com o que já tinha e pra garantir que o resultado bate
    // exatamente com a planilha importada
    await Promise.all(gerotBlocos.map(b=> apiRequest('DELETE', `/gerot/${b.id}`).catch(()=>{})));

    let importados = 0, falhas = 0;
    for(let linhaIdx=1; linhaIdx<dados.length && linhaIdx<=GEROT_HORARIOS.length; linhaIdx++){
      const horarioInicio = GEROT_HORARIOS[linhaIdx-1];
      for(let diaIdx=0; diaIdx<5; diaIdx++){
        const coluna = diaIdx+1;
        const texto = ((dados[linhaIdx]||[])[coluna]||'').toString().trim();
        if(!texto) continue;
        const merge = merges.find(m=> m.s.r===linhaIdx && m.s.c===coluna);
        const horarioFim = merge ? GEROT_LIMITES[merge.e.r] : GEROT_LIMITES[linhaIdx];
        if(!horarioFim) continue; // fora do intervalo de horários válidos (08:00-19:30), ignora
        try{
          await apiRequest('PUT', '/gerot', { semanaInicio: gerotSemanaAtual, diaSemana: diaIdx, horarioInicio, horarioFim, texto });
          importados++;
        }catch(e){ falhas++; }
      }
    }
    await loadGerot(gerotSemanaAtual);
    gerotImportMsg = { tipo: falhas ? 'erro' : 'ok', texto: `${importados} bloco(s) importado(s)${falhas ? `, ${falhas} não puderam ser importados (conflito de horário)` : ''}.` };
  }catch(e){
    gerotImportMsg = { tipo:'erro', texto:'Não foi possível ler essa planilha. Confira se ela segue o mesmo formato exportado pelo sistema.' };
  }
  gerotImportando = false;
  renderApp();
}
async function copiarSemanaAnteriorGerot(){
  const [ano,mes,dia] = gerotSemanaAtual.split('-').map(Number);
  const semanaAnterior = inicioDaSemana(new Date(ano, mes-1, dia - 7));
  gerotCopiando = true;
  renderApp();
  try{
    await apiRequest('POST', '/gerot/copiar', { semanaOrigem: semanaAnterior, semanaDestino: gerotSemanaAtual });
    await loadGerot(gerotSemanaAtual);
  }catch(e){
    errorMsg = 'Não foi possível copiar a semana anterior.';
  }
  gerotCopiando = false;
  renderApp();
}
async function loadAgendaMes(mesKey){
  agendaLoaded = false;
  renderApp();
  try{
    const data = await apiRequest('GET', `/calendar/agenda-mes?mes=${mesKey}`);
    agendaTarefas = data.tarefas || [];
    agendaEventosGoogle = data.eventosGoogle || [];
  }catch(e){
    errorMsg = e.message || 'Não foi possível carregar a agenda.';
    agendaTarefas = [];
    agendaEventosGoogle = [];
  }
  agendaLoaded = true;
  renderApp();
}
function mudarMesAgenda(delta){
  const [ano, mes] = agendaMesAtual.split('-').map(Number);
  const d = new Date(ano, mes - 1 + delta, 1);
  agendaMesAtual = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  agendaDiaDestacado = null;
  loadAgendaMes(agendaMesAtual);
}
// Extrai a data (YYYY-MM-DD) certa do vencimento de uma tarefa, em horário local —
// mesma lógica usada em openEditTask, pra tarefa com horário não "vazar" pro dia
// seguinte por causa do UTC.
function dataLocalDaTarefa(vencimentoIso){
  if(!vencimentoIso) return null;
  const d = new Date(vencimentoIso);
  if(isNaN(d.getTime())) return null;
  const temHora = d.getUTCHours()!==0 || d.getUTCMinutes()!==0;
  if(temHora) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return vencimentoIso.slice(0,10);
}
// Atualiza (ou remove) uma tarefa direto no estado local da Agenda, sem precisar
// buscar tudo de novo no servidor — evita uma ida desnecessária ao Google Agenda
// (que só deveria acontecer quando a pessoa clica em "Sincronizar Agenda" de propósito).
function atualizarTarefaNaAgendaLocal(t){
  if(!t.vencimento || !agendaMesAtual) return;
  const mesDaTarefa = dataLocalDaTarefa(t.vencimento).slice(0,7);
  const idx = agendaTarefas.findIndex(x=>x.id===t.id);
  if(mesDaTarefa !== agendaMesAtual){
    if(idx>-1) agendaTarefas.splice(idx,1); // mudou pra fora do mês em tela — some da visão atual
    return;
  }
  const card = t.leadId ? board.cards.find(c=>c.id===t.leadId) : null;
  const comNome = { ...t, clienteNome: card ? card.cliente : null };
  if(idx>-1) agendaTarefas[idx] = comNome;
  else agendaTarefas.push(comNome);
}
function removerTarefaDaAgendaLocal(id){
  agendaTarefas = agendaTarefas.filter(x=>x.id!==id);
}
function itensDoDiaAgenda(diaISO){
  const tarefasDoDia = agendaTarefas.filter(t=> dataLocalDaTarefa(t.vencimento)===diaISO);
  const eventosDoDia = agendaEventosGoogle.filter(e=> e.inicio && e.inicio.slice(0,10)===diaISO);
  return { tarefasDoDia, eventosDoDia };
}
async function loadContratos(){
  try{
    const data = await apiRequest('GET', '/comissoes');
    contratos = data.contratos;
  }catch(e){
    contratos = [];
  }
  contratosLoaded = true;
  renderApp();
}
// Regras de comissão (engrenagem em Comissões) — na 1ª vez, o servidor já cria as
// regras padrão (Imóvel, Veículo, Investimento, Serviços, Home Equity, Car Equity)
// com a mesma matemática que sempre existiu, então nada muda pra quem nunca mexer nisso.
async function loadRegrasComissao(){
  try{
    const data = await apiRequest('GET', '/regras-comissao');
    regrasComissao = data.regras;
  }catch(e){
    regrasComissao = [];
  }
  regrasComissaoLoaded = true;
  renderApp();
}

/* ---------- Google Agenda ---------- */
async function loadCalendarStatus(){
  try{
    const data = await apiRequest('GET', '/calendar/status');
    calendarConnected = !!data.connected;
  }catch(e){
    calendarConnected = false;
  }
  renderApp();
}
// Quais integrações que dependem do servidor (não do usuário) estão configuradas nesse
// ambiente — chamada 1x no início, pra decidir o que mostrar em Configurações. Pública,
// não exige estar logado (mas não tem problema mandar o token também).
async function loadIntegracoesConfig(){
  try{
    const data = await apiRequest('GET', '/config/integracoes');
    integracoesConfig = { ...integracoesConfig, ...data };
  }catch(e){
    // se não conseguir checar, mantém tudo visível (otimista) — melhor mostrar um botão
    // que às vezes falha do que esconder uma integração que na verdade está configurada
  }
  renderApp();
  renderAssistente();
}
/* ---------- Agenda por link (.ics) — alternativa ao Google Agenda ---------- */
async function loadIcsStatus(){
  icsCarregando = true;
  try{
    icsStatus = await apiRequest('GET', '/calendar/ics-status');
  }catch(e){
    icsStatus = null;
  }
  icsCarregando = false;
  renderApp();
}
async function gerarLinkIcs(){
  icsGerando = true;
  renderApp();
  try{
    icsStatus = await apiRequest('POST', '/calendar/ics/gerar');
  }catch(e){
    errorMsg = e.message || 'Não foi possível gerar o link de agenda.';
  }
  icsGerando = false;
  renderApp();
}
function revogarLinkIcs(){
  showConfirm({
    message: 'Revogar o link de agenda atual? Quem já assinou esse link (Google, Apple, Outlook…) para de receber atualizações. Você pode gerar um link novo a qualquer momento.',
    confirmLabel: 'Revogar',
    onConfirm: async ()=>{
      closeConfirm();
      try{
        await apiRequest('POST', '/calendar/ics/revogar');
        icsStatus = { ativo:false, url:null };
      }catch(e){
        errorMsg = e.message || 'Não foi possível revogar o link de agenda.';
      }
      renderApp();
    },
  });
}

/* ---------- WhatsApp Business API ---------- */
async function loadWhatsappStatus(){
  try{
    const data = await apiRequest('GET', '/whatsapp/status');
    whatsappConnected = !!data.connected;
    agenteIaAtivo = !!data.agenteIaAtivo;
    iaProativaAtiva = !!data.iaProativaAtiva;
  }catch(e){
    whatsappConnected = false;
  }
  renderApp();
}
async function definirIaProativa(ativo){
  try{
    await apiRequest('POST', '/whatsapp/ia-proativa', { ativo });
    iaProativaAtiva = ativo;
  }catch(e){
    errorMsg = e.message || 'Não foi possível atualizar a IA proativa.';
  }
  renderApp();
}

/* ---------- Menu de triagem (fluxo de primeiro contato) ---------- */
async function loadMenuTriagem(){
  try{
    const data = await apiRequest('GET', '/whatsapp/menu-triagem');
    menuTriagem = data.menuTriagem || { ativo:false, mensagemInicial:'', opcoes:[] };
  }catch(e){
    menuTriagem = { ativo:false, mensagemInicial:'', opcoes:[] };
  }
  menuTriagemCarregado = true;
  renderApp();
}
async function salvarMenuTriagem(){
  if(menuTriagem.ativo){
    if(!menuTriagem.mensagemInicial.trim() || !menuTriagem.opcoes.length){
      menuTriagemMsg = { tipo:'erro', texto:'Escreva a mensagem inicial e adicione ao menos uma opção antes de ativar.' };
      renderApp();
      return;
    }
  }
  menuTriagemSalvando = true;
  menuTriagemMsg = null;
  renderApp();
  try{
    const data = await apiRequest('PUT', '/whatsapp/menu-triagem', menuTriagem);
    menuTriagem = data.menuTriagem;
    menuTriagemMsg = { tipo:'ok', texto:'Menu salvo.' };
  }catch(e){
    menuTriagemMsg = { tipo:'erro', texto: e.message || 'Não foi possível salvar o menu.' };
  }
  menuTriagemSalvando = false;
  renderApp();
}
async function definirAgenteIa(ativo){
  try{
    await apiRequest('POST', '/whatsapp/agente-ia', { ativo });
    agenteIaAtivo = ativo;
  }catch(e){
    errorMsg = e.message || 'Não foi possível atualizar o agente de IA.';
  }
  renderApp();
}
async function salvarWhatsappConfig(){
  const phoneEl = document.getElementById('wa-phone-id');
  const tokenEl = document.getElementById('wa-token');
  const wabaEl = document.getElementById('wa-waba-id');
  const phoneNumberId = phoneEl ? phoneEl.value.trim() : '';
  const accessToken = tokenEl ? tokenEl.value.trim() : '';
  const wabaId = wabaEl ? wabaEl.value.trim() : '';
  if(!phoneNumberId || !accessToken){
    whatsappConfigMsg = { tipo:'erro', texto:'Preencha o Phone Number ID e o Access Token.' };
    renderApp();
    return;
  }
  whatsappSalvando = true;
  whatsappConfigMsg = null;
  renderApp();
  try{
    await apiRequest('POST', '/whatsapp/configurar', { phoneNumberId, accessToken, wabaId });
    whatsappConnected = true;
    whatsappConfigMsg = { tipo:'ok', texto:'Conectado com sucesso.' };
  }catch(e){
    whatsappConfigMsg = { tipo:'erro', texto: e.message || 'Não foi possível salvar a configuração.' };
  }
  whatsappSalvando = false;
  renderApp();
}
async function desconectarWhatsapp(){
  try{
    await apiRequest('POST', '/whatsapp/desconectar');
    whatsappConnected = false;
  }catch(e){
    errorMsg = 'Não foi possível desconectar o WhatsApp Business.';
  }
  renderApp();
}

/* ---------- Instagram (captação de leads) ---------- */
async function loadInstagramStatus(){
  try{
    const data = await apiRequest('GET', '/instagram/status');
    instagramConnected = !!data.connected;
  }catch(e){
    instagramConnected = false;
  }
  renderApp();
}
async function salvarInstagramConfig(){
  const pageIdEl = document.getElementById('ig-page-id');
  const tokenEl = document.getElementById('ig-page-token');
  const igBusinessIdEl = document.getElementById('ig-business-id');
  const pageId = pageIdEl ? pageIdEl.value.trim() : '';
  const pageAccessToken = tokenEl ? tokenEl.value.trim() : '';
  const igBusinessId = igBusinessIdEl ? igBusinessIdEl.value.trim() : '';
  if(!pageId || !pageAccessToken){
    instagramConfigMsg = { tipo:'erro', texto:'Preencha o Page ID e o Access Token da página.' };
    renderApp();
    return;
  }
  instagramSalvando = true;
  instagramConfigMsg = null;
  renderApp();
  try{
    await apiRequest('POST', '/instagram/configurar', { pageId, pageAccessToken, igBusinessId });
    instagramConnected = true;
    instagramConfigMsg = { tipo:'ok', texto:'Conectado com sucesso.' };
  }catch(e){
    instagramConfigMsg = { tipo:'erro', texto: e.message || 'Não foi possível salvar a configuração.' };
  }
  instagramSalvando = false;
  renderApp();
}
async function desconectarInstagram(){
  try{
    await apiRequest('POST', '/instagram/desconectar');
    instagramConnected = false;
  }catch(e){
    errorMsg = 'Não foi possível desconectar o Instagram.';
  }
  renderApp();
}

async function abrirHistoricoCard(){
  const box = document.getElementById('f-historico');
  if(!box || !modalForm || modalForm.__isNew) return;
  box.style.display = 'block';
  box.innerHTML = '<p class="settings-page-note">Carregando histórico…</p>';

  let mensagens = [];
  try{
    const data = await apiRequest('GET', `/whatsapp/conversas/${modalForm.id}`);
    mensagens = data.mensagens || [];
  }catch(e){ /* sem WhatsApp conectado ou sem conversa — segue sem elas */ }

  const tarefasDoLead = tasks.filter(t=>t.leadId===modalForm.id);

  const eventos = [];
  if(modalForm.createdAt){
    eventos.push({ texto:'Cliente criado', data: modalForm.createdAt, icone:'✦' });
  }
  tarefasDoLead.forEach(t=>{
    eventos.push({ texto:`Tarefa criada: ${t.titulo}${t.concluida?' (concluída)':''}`, data: t.createdAt || t.vencimento, icone:'✓' });
  });
  mensagens.forEach(m=>{
    eventos.push({ texto:`${m.direction==='out'?'Você':'Cliente'}: ${(m.texto||'').slice(0,80)}`, data: m.timestamp, icone:'💬' });
  });
  eventos.sort((a,b)=> new Date(b.data) - new Date(a.data));

  box.innerHTML = eventos.length ? `
    <div class="historico-lista">
      ${eventos.map(ev=>`
        <div class="historico-item">
          <span class="historico-item-icone">${ev.icone}</span>
          <span class="historico-item-texto">${esc(ev.texto)}</span>
          <span class="historico-item-data">${formatDateHora(ev.data)}</span>
        </div>
      `).join('')}
    </div>
  ` : '<p class="settings-page-note">Nenhum evento registrado ainda.</p>';
}

/* ---------- proposta em PDF (dentro do card do cliente) ---------- */
function abrirPropostaModal(){
  if(!modalForm || modalForm.__isNew) return;
  const daqui7dias = new Date();
  daqui7dias.setDate(daqui7dias.getDate()+7);
  propostaModalForm = {
    cliente: modalForm.cliente || '',
    valor: Number(modalForm.valor) || 0,
    parcelas: 80,
    validade: daqui7dias.toISOString().slice(0,10),
  };
  renderPropostaModal();
}
function closePropostaModal(){ propostaModalForm = null; document.getElementById('modal-root').innerHTML=''; }
function renderPropostaModal(){
  const root = document.getElementById('modal-root');
  if(!propostaModalForm){ root.innerHTML=''; return; }
  const f = propostaModalForm;
  root.innerHTML = `
    <div class="overlay" id="proposta-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Gerar proposta</h3>
          <button id="proposta-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field"><label>Cliente</label><input type="text" id="proposta-cliente" value="${esc(f.cliente)}" /></div>
          <div class="field-row">
            <div class="field"><label>Valor da carta (R$)</label><input type="number" id="proposta-valor" value="${f.valor}" min="0" step="0.01" /></div>
            <div class="field"><label>Nº de parcelas</label><input type="number" id="proposta-parcelas" value="${f.parcelas}" min="1" /></div>
          </div>
          <div class="field"><label>Válida até</label><input type="date" id="proposta-validade" value="${f.validade}" /></div>
          <p class="settings-page-note">Parcela estimada: ${fmtBRL((f.valor||0)/(f.parcelas||1))}</p>
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="proposta-cancel">Cancelar</button>
            <button class="btn-save" id="proposta-gerar">Gerar PDF</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('proposta-modal-close').addEventListener('click', closePropostaModal);
  document.getElementById('proposta-cancel').addEventListener('click', closePropostaModal);
  document.getElementById('proposta-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='proposta-modal-overlay') closePropostaModal(); });
  document.getElementById('proposta-cliente').addEventListener('input', (e)=> propostaModalForm.cliente = e.target.value);
  document.getElementById('proposta-valor').addEventListener('input', (e)=>{ propostaModalForm.valor = parseFloat(e.target.value)||0; renderPropostaModal(); });
  document.getElementById('proposta-parcelas').addEventListener('input', (e)=>{ propostaModalForm.parcelas = parseInt(e.target.value,10)||1; renderPropostaModal(); });
  document.getElementById('proposta-validade').addEventListener('input', (e)=> propostaModalForm.validade = e.target.value);
  document.getElementById('proposta-gerar').addEventListener('click', gerarPropostaPdf);
}
function gerarPropostaPdf(){
  const f = propostaModalForm;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 25;
  doc.setFontSize(20);
  doc.text('Proposta de Carta de Crédito', 14, y); y += 10;
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text(`Consultor: ${(currentUser&&currentUser.nome)||''}`, 14, y); y += 14;
  doc.setTextColor(20);

  doc.setFontSize(12);
  doc.text(`Cliente: ${f.cliente}`, 14, y); y += 8;
  doc.text(`Valor da carta: ${fmtBRL(f.valor)}`, 14, y); y += 8;
  doc.text(`Número de parcelas: ${f.parcelas}`, 14, y); y += 8;
  doc.text(`Parcela estimada: ${fmtBRL(f.valor/(f.parcelas||1))}`, 14, y); y += 8;
  doc.text(`Proposta válida até: ${formatDate(f.validade)}`, 14, y); y += 16;

  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text('Valores sujeitos a alteração conforme condições da administradora de consórcio no momento da contratação.', 14, y, { maxWidth: 180 });

  doc.save(`proposta_${(f.cliente||'cliente').replace(/\s+/g,'_')}.pdf`);
  closePropostaModal();
}

async function abrirConversaWhatsapp(){
  const box = document.getElementById('f-wa-conversa');
  if(!box || !modalForm || modalForm.__isNew) return;
  box.style.display = 'block';
  box.innerHTML = '<p class="settings-page-note">Carregando conversa…</p>';
  try{
    const data = await apiRequest('GET', `/whatsapp/conversas/${modalForm.id}`);
    renderConversaWhatsapp(data.mensagens || []);
  }catch(e){
    box.innerHTML = `<p class="settings-page-msg erro">${esc(e.message || 'Não foi possível carregar a conversa.')}</p>`;
  }
}
function statusMensagemIcone(status){
  if(status === 'read') return `<span class="wa-status wa-status-read" title="Lida">✓✓</span>`;
  if(status === 'delivered') return `<span class="wa-status" title="Entregue">✓✓</span>`;
  if(status === 'failed') return `<span class="wa-status wa-status-failed" title="Falhou">⚠</span>`;
  if(status === 'sent') return `<span class="wa-status" title="Enviada">✓</span>`;
  return '';
}
// Monta o conteúdo de uma mensagem — texto normal, ou a mídia (foto/áudio/documento/vídeo)
// quando ela tiver um anexo vinculado. Reaproveitado nas duas telas de chat do app.
function renderConteudoMensagem(m){
  const iconeCanal = m.canal==='instagram' ? '📷 ' : '';
  if(!m.anexo) return `<p>${iconeCanal}${esc(m.texto)}</p>`;
  const a = m.anexo;
  if(m.midiaTipo==='image'){
    return `<img src="${a.dadosBase64}" alt="${esc(a.nomeArquivo)}" class="wa-msg-imagem" />`;
  }
  if(m.midiaTipo==='audio'){
    return `<audio controls src="${a.dadosBase64}" class="wa-msg-audio"></audio>`;
  }
  return `<a href="${a.dadosBase64}" download="${esc(a.nomeArquivo)}" class="wa-msg-arquivo">${m.midiaTipo==='video'?'🎥':'📄'} ${esc(a.nomeArquivo)}</a>`;
}
function renderConversaWhatsapp(mensagens){
  const box = document.getElementById('f-wa-conversa');
  if(!box) return;
  box.innerHTML = `
    <div class="wa-conversa-lista">
      ${mensagens.length ? mensagens.map(m=>`
        <div class="wa-msg wa-msg-${m.direction}">
          ${renderConteudoMensagem(m)}
          <span>${new Date(m.timestamp).toLocaleString('pt-BR')} ${m.direction==='out' ? statusMensagemIcone(m.status) : ''}</span>
        </div>
      `).join('') : '<p class="settings-page-note">Nenhuma mensagem ainda.</p>'}
    </div>
    <div class="wa-conversa-input-row">
      <input type="text" id="wa-nova-msg" placeholder="Digite uma mensagem..." />
      <button type="button" class="btn-primary" id="wa-enviar-btn">Enviar</button>
    </div>
  `;
  const lista = box.querySelector('.wa-conversa-lista');
  if(lista) lista.scrollTop = lista.scrollHeight;
  const input = document.getElementById('wa-nova-msg');
  const enviarBtn = document.getElementById('wa-enviar-btn');
  const enviar = async ()=>{
    const texto = input.value.trim();
    if(!texto || !modalForm) return;
    enviarBtn.disabled = true;
    try{
      await apiRequest('POST', '/whatsapp/enviar', { cardId: modalForm.id, texto });
      input.value = '';
      await abrirConversaWhatsapp();
    }catch(e){
      errorMsg = e.message || 'Não foi possível enviar a mensagem.';
      renderApp();
    }
    if(enviarBtn) enviarBtn.disabled = false;
  };
  enviarBtn.addEventListener('click', enviar);
  input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') enviar(); });
}

function formatDateHora(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function formatHora(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}

async function loadConversas(){
  try{
    const data = await apiRequest('GET', '/whatsapp/conversas');
    conversas = data.conversas || [];
  }catch(e){
    conversas = [];
  }
  conversasLoaded = true;
  renderApp();
}
async function selecionarConversa(cardId){
  if(conversaSelecionadaCardId === cardId) return;
  conversaSelecionadaCardId = cardId;
  conversaMensagensLoaded = false;
  conversaMensagens = [];
  renderApp();
  await carregarMensagensConversa(cardId, true);
  iniciarPollingConversa();
}
async function carregarMensagensConversa(cardId, primeiraVez){
  try{
    const data = await apiRequest('GET', `/whatsapp/conversas/${cardId}`);
    if(conversaSelecionadaCardId === cardId) conversaMensagens = data.mensagens || [];
  }catch(e){
    if(primeiraVez) conversaMensagens = [];
  }
  conversaMensagensLoaded = true;
  renderApp();
}
function iniciarPollingConversa(){
  pararPollingConversa();
  conversaPollingTimer = setInterval(()=>{
    if(conversaSelecionadaCardId && currentPage==='conversas') carregarMensagensConversa(conversaSelecionadaCardId, false);
  }, 6000);
}
function pararPollingConversa(){
  if(conversaPollingTimer){ clearInterval(conversaPollingTimer); conversaPollingTimer = null; }
}
async function enviarMensagemConversa(){
  if(!conversaTexto.trim() || !conversaSelecionadaCardId) return;
  conversaEnviando = true;
  renderApp();
  try{
    await apiRequest('POST', '/whatsapp/enviar', { cardId: conversaSelecionadaCardId, texto: conversaTexto });
    conversaTexto = '';
    await carregarMensagensConversa(conversaSelecionadaCardId, false);
    loadConversas(); // atualiza a prévia na lista da esquerda, sem travar a tela esperando
  }catch(e){
    errorMsg = e.message || 'Não foi possível enviar a mensagem.';
  }
  conversaEnviando = false;
  renderApp();
}
async function salvarCampoClienteConversa(campo, valor){
  const card = board.cards.find(c=>c.id===conversaSelecionadaCardId);
  if(!card) return;
  const anterior = card[campo];
  card[campo] = valor; // otimista
  try{
    await apiRequest('PUT', `/cards/${conversaSelecionadaCardId}`, { [campo]: valor });
    if(campo==='cliente' || campo==='telefone') loadConversas(); // atualiza nome/telefone na lista da esquerda também
  }catch(e){
    card[campo] = anterior;
    errorMsg = 'Não foi possível salvar a alteração.';
    renderApp();
  }
}
async function executarAutomacaoManual(automacaoId){
  if(!conversaSelecionadaCardId) return;
  try{
    await apiRequest('POST', `/automacoes/${automacaoId}/executar-manual`, { cardId: conversaSelecionadaCardId });
    await loadTasks();
  }catch(e){
    errorMsg = e.message || 'Não foi possível executar a automação.';
  }
  renderApp();
}

/* ---------- Equipe (Chat Interno + Supervisão) ---------- */
async function loadEquipe(){
  try{
    const data = await apiRequest('GET', '/equipe');
    equipe = data.equipe;
  }catch(e){
    equipe = null;
  }
  equipeLoaded = true;
  renderApp();
  if(equipe && currentPage === 'equipe'){
    if(equipeSubTab==='chat' && !chatLoaded) loadChat();
    if(equipeSubTab==='supervisao' && equipe.souSupervisor && !supervisaoLoaded) loadSupervisao();
    if(equipeSubTab==='monitoramento' && equipe.souSupervisorDeDados && !monitoramentoLoaded) loadMonitoramento();
  }
}
async function loadChat(){
  if(!equipe){ chatLoaded = true; renderApp(); return; }
  try{
    const data = await apiRequest('GET', '/equipe/chat');
    chatMensagens = data.mensagens || [];
  }catch(e){
    chatMensagens = [];
  }
  chatLoaded = true;
  renderApp();
}
async function loadMonitoramento(){
  monitoramentoLoaded = false;
  renderApp();
  try{
    const data = await apiRequest('GET', '/monitoramento/erros');
    monitoramentoErros = data.erros || [];
  }catch(e){
    monitoramentoErros = [];
  }
  monitoramentoLoaded = true;
  renderApp();
}
async function limparMonitoramento(){
  showConfirm({
    message: 'Limpar todo o log de erros registrado? Não afeta o funcionamento do sistema, só apaga o histórico.',
    confirmLabel: 'Limpar',
    onConfirm: async ()=>{
      closeConfirm();
      try{
        await apiRequest('DELETE', '/monitoramento/erros');
        monitoramentoErros = [];
      }catch(e){
        errorMsg = 'Não foi possível limpar o log agora.';
      }
      renderApp();
    },
  });
}
async function loadSupervisao(){
  if(!equipe || !equipe.souSupervisor){ supervisaoLoaded = true; renderApp(); return; }
  try{
    const data = await apiRequest('GET', '/equipe/supervisao');
    supervisaoMembros = data.membros || [];
  }catch(e){
    supervisaoMembros = [];
  }
  supervisaoLoaded = true;
  renderApp();
}
// Troca temporariamente os dados em tela (board, tarefas, meta) pelos de um membro da
// equipe, pro gestor ver o Dashboard dele exatamente como ele vê o próprio — sem
// nenhuma ação de edição disponível. sairDashboardDeMembro() devolve tudo como estava.
async function abrirDashboardDeMembro(userId, nome){
  try{
    const data = await apiRequest('GET', `/equipe/supervisao/${userId}/dashboard`);
    boardBackupGestor = board;
    tasksBackupGestor = tasks;
    metaVendasValorBackupGestor = metaVendasValor;
    board = { columns: data.columns || [], cards: data.cards || [] };
    tasks = data.tasks || [];
    tasksLoaded = true;
    metaVendasValor = data.metaVendasValor || 0;
    visualizandoDashboardDe = { userId, nome: data.nome || nome };
    goToPage('dashboard');
  }catch(e){
    errorMsg = 'Não foi possível carregar o dashboard desse membro.';
    renderApp();
  }
}
function sairDashboardDeMembro(){
  goToPage('equipe'); // a própria goToPage já restaura board/tasks/meta ao sair do dashboard
  equipeSubTab = 'supervisao';
  renderApp();
}

/* ---------- Automações ---------- */
async function loadAutomacoes(){
  try{
    const data = await apiRequest('GET', '/automacoes');
    automacoes = data.automacoes || [];
  }catch(e){
    automacoes = [];
  }
  automacoesLoaded = true;
  renderApp();
}
async function salvarAutomacao(){
  const f = automacaoModalForm;
  if(!f.nome.trim() || !f.colunaGatilhoId) return;
  const dados = { nome: f.nome, colunaGatilhoId: f.colunaGatilhoId, gatilhoTipo: f.gatilhoTipo, acaoTipo: f.acaoTipo, acaoParams: f.acaoParams };
  try{
    if(f.__isNew){
      const nova = await apiRequest('POST', '/automacoes', dados);
      automacoes.unshift(nova);
    } else {
      const atualizada = await apiRequest('PUT', `/automacoes/${f.id}`, dados);
      const idx = automacoes.findIndex(a=>a.id===f.id);
      if(idx>-1) automacoes[idx] = atualizada;
    }
    closeAutomacaoModal();
  }catch(e){
    errorMsg = e.message || 'Não foi possível salvar a automação.';
  }
  renderApp();
}
async function toggleAutomacaoAtiva(id){
  const a = automacoes.find(x=>x.id===id);
  if(!a) return;
  const anterior = a.ativa;
  a.ativa = !a.ativa;
  renderApp();
  try{
    await apiRequest('PUT', `/automacoes/${id}`, { ativa: a.ativa });
  }catch(e){
    a.ativa = anterior;
    errorMsg = 'Não foi possível atualizar a automação.';
    renderApp();
  }
}
async function excluirAutomacao(id){
  const idx = automacoes.findIndex(a=>a.id===id);
  if(idx===-1) return;
  const [removida] = automacoes.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/automacoes/${id}`);
  }catch(e){
    automacoes.splice(idx,0,removida);
    errorMsg = 'Não foi possível excluir a automação.';
    renderApp();
  }
}

/* ---------- Fluxos ---------- */
async function loadFluxos(){
  try{
    const data = await apiRequest('GET', '/fluxos');
    fluxos = data.fluxos || [];
  }catch(e){
    fluxos = [];
  }
  fluxosLoaded = true;
  renderApp();
}
async function salvarFluxo(){
  const f = fluxoModalForm;
  if(!f.nome.trim() || !f.colunaGatilhoId || !f.etapas.length) return;
  const dados = { nome: f.nome, colunaGatilhoId: f.colunaGatilhoId, etapas: f.etapas };
  try{
    if(f.__isNew){
      const novo = await apiRequest('POST', '/fluxos', dados);
      novo.emAndamento = 0;
      fluxos.unshift(novo);
    } else {
      const atualizado = await apiRequest('PUT', `/fluxos/${f.id}`, dados);
      const idx = fluxos.findIndex(x=>x.id===f.id);
      if(idx>-1) fluxos[idx] = { ...fluxos[idx], ...atualizado };
    }
    closeFluxoModal();
  }catch(e){
    errorMsg = e.message || 'Não foi possível salvar o fluxo.';
  }
  renderApp();
}
async function toggleFluxoAtivo(id){
  const f = fluxos.find(x=>x.id===id);
  if(!f) return;
  const anterior = f.ativo;
  f.ativo = !f.ativo;
  renderApp();
  try{
    await apiRequest('PUT', `/fluxos/${id}`, { ativo: f.ativo });
  }catch(e){
    f.ativo = anterior;
    errorMsg = 'Não foi possível atualizar o fluxo.';
    renderApp();
  }
}
async function excluirFluxo(id){
  const idx = fluxos.findIndex(f=>f.id===id);
  if(idx===-1) return;
  const [removido] = fluxos.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/fluxos/${id}`);
  }catch(e){
    fluxos.splice(idx,0,removido);
    errorMsg = 'Não foi possível excluir o fluxo.';
    renderApp();
  }
}

/* ---------- Importar/Exportar (planilha -> possíveis leads) ---------- */
function handlePlanilhaFileSelected(file){
  if(!file) return;
  importPlanilhaMsg = null;
  importPlanilhaNomeArquivo = file.name;
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const workbook = XLSX.read(e.target.result, { type:'array' });
      const primeiraAba = workbook.SheetNames[0];
      const linhas = XLSX.utils.sheet_to_json(workbook.Sheets[primeiraAba], { defval:'' });
      if(!linhas.length){
        importPlanilhaMsg = { tipo:'erro', texto:'A planilha parece estar vazia.' };
        importPlanilhaLinhas = [];
        importPlanilhaColunas = [];
        renderApp();
        return;
      }
      importPlanilhaLinhas = linhas;
      importPlanilhaColunas = Object.keys(linhas[0]);
      // tenta adivinhar as colunas certas pelo nome, só pra facilitar — usuário confirma/ajusta de qualquer forma
      const achar = (padroes)=> importPlanilhaColunas.find(c=> padroes.some(p=> c.toLowerCase().includes(p))) || '';
      importMapNome = achar(['nome']);
      importMapTelefone = achar(['telefone','celular','fone','whats']);
      importMapServico = achar(['serviço','servico','produto','interesse','tipo']);
      importPlanilhaMsg = null;
    }catch(err){
      importPlanilhaMsg = { tipo:'erro', texto:'Não foi possível ler esse arquivo. Confira se é um .csv ou .xlsx válido.' };
      importPlanilhaLinhas = [];
      importPlanilhaColunas = [];
    }
    renderApp();
  };
  reader.readAsArrayBuffer(file);
}
async function confirmarImportPlanilha(){
  if(!importMapNome && !importMapTelefone){
    importPlanilhaMsg = { tipo:'erro', texto:'Escolha ao menos a coluna de nome ou de telefone.' };
    renderApp();
    return;
  }
  const linhas = importPlanilhaLinhas.map(linha=>({
    nome: importMapNome ? linha[importMapNome] : '',
    telefone: importMapTelefone ? linha[importMapTelefone] : '',
    tipoServico: importMapServico ? linha[importMapServico] : '',
  }));
  importandoPlanilha = true;
  importPlanilhaMsg = null;
  renderApp();
  try{
    const data = await apiRequest('POST', '/possiveis-leads/importar', { linhas, origemArquivo: importPlanilhaNomeArquivo });
    importPlanilhaMsg = { tipo:'ok', texto:`${data.total} possível lead(s) importado(s).` };
    importPlanilhaLinhas = [];
    importPlanilhaColunas = [];
    importPlanilhaNomeArquivo = '';
    await loadPossiveisLeads();
  }catch(e){
    importPlanilhaMsg = { tipo:'erro', texto: e.message || 'Não foi possível importar a planilha.' };
  }
  importandoPlanilha = false;
  renderApp();
}
async function loadPossiveisLeads(){
  try{
    const data = await apiRequest('GET', '/possiveis-leads');
    possiveisLeads = data.leads || [];
  }catch(e){
    possiveisLeads = [];
  }
  possiveisLeadsCarregados = true;
  renderApp();
}
async function descartarPossivelLead(id){
  const idx = possiveisLeads.findIndex(l=>l.id===id);
  if(idx===-1) return;
  const [removido] = possiveisLeads.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/possiveis-leads/${id}`);
  }catch(e){
    possiveisLeads.splice(idx,0,removido);
    errorMsg = 'Não foi possível descartar.';
    renderApp();
  }
}
function abrirCompletarLead(id){
  const lead = possiveisLeads.find(l=>l.id===id);
  if(!lead) return;
  completarLeadModalForm = {
    possivelLeadId: lead.id, nome: lead.nome||'', telefone: lead.telefone||'',
    tipoServico: lead.tipoServico||'', columnId: ((board.columns.find(c=>c.tipo==='aberto')||board.columns[0]||{}).id)||'',
    valor: 0, temperatura:'morno',
  };
  completarLeadMsg = null;
  renderCompletarLeadModal();
}
function closeCompletarLeadModal(){ completarLeadModalForm = null; document.getElementById('modal-root').innerHTML=''; }
async function salvarCompletarLead(){
  const f = completarLeadModalForm;
  if(!f.nome.trim()){
    completarLeadMsg = { tipo:'erro', texto:'Informe o nome do cliente.' };
    renderCompletarLeadModal();
    return;
  }
  if(!f.columnId){
    completarLeadMsg = { tipo:'erro', texto:'Escolha a coluna de destino.' };
    renderCompletarLeadModal();
    return;
  }
  completarLeadSalvando = true;
  completarLeadMsg = null;
  renderCompletarLeadModal();
  try{
    const novoCard = await apiRequest('POST', `/possiveis-leads/${f.possivelLeadId}/promover`, {
      nome: f.nome, telefone: f.telefone, columnId: f.columnId, valor: f.valor,
      temperatura: f.temperatura, obs: f.tipoServico ? `Serviço de interesse: ${f.tipoServico}` : '',
      mes: currentMonthKey(),
    });
    board.cards.push(novoCard);
    possiveisLeads = possiveisLeads.filter(l=>l.id!==f.possivelLeadId);
    closeCompletarLeadModal();
    renderApp();
  }catch(e){
    completarLeadMsg = { tipo:'erro', texto: e.message || 'Não foi possível adicionar aos Leads.' };
    completarLeadSalvando = false;
    renderCompletarLeadModal();
  }
}
function renderCompletarLeadModal(){
  const root = document.getElementById('modal-root');
  if(!completarLeadModalForm){ root.innerHTML=''; return; }
  const f = completarLeadModalForm;
  root.innerHTML = `
    <div class="overlay" id="cl-lead-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Completar e adicionar aos Leads</h3>
          <button id="cl-lead-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field"><label>Nome</label><input type="text" id="cl-lead-nome" value="${esc(f.nome)}" /></div>
          <div class="field"><label>Telefone</label><input type="text" id="cl-lead-telefone" value="${esc(f.telefone)}" /></div>
          ${f.tipoServico ? `<p class="settings-page-note">Serviço de interesse (da planilha): <b>${esc(f.tipoServico)}</b></p>` : ''}
          <div class="field">
            <label>Coluna de destino</label>
            <select id="cl-lead-coluna">
              ${board.columns.map(c=>`<option value="${c.id}" ${f.columnId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="field-row">
            <div class="field"><label>Valor (opcional)</label><input type="number" id="cl-lead-valor" value="${f.valor}" min="0" step="0.01" /></div>
            <div class="field">
              <label>Temperatura</label>
              <select id="cl-lead-temp">
                <option value="frio" ${f.temperatura==='frio'?'selected':''}>Frio</option>
                <option value="morno" ${f.temperatura==='morno'?'selected':''}>Morno</option>
                <option value="quente" ${f.temperatura==='quente'?'selected':''}>Quente</option>
              </select>
            </div>
          </div>
          ${completarLeadMsg ? `<p class="settings-page-msg ${completarLeadMsg.tipo}">${esc(completarLeadMsg.texto)}</p>` : ''}
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="cl-lead-cancel">Cancelar</button>
            <button class="btn-save" id="cl-lead-salvar" ${completarLeadSalvando?'disabled':''}>${completarLeadSalvando?'Adicionando…':'Adicionar aos Leads'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('cl-lead-close').addEventListener('click', closeCompletarLeadModal);
  document.getElementById('cl-lead-cancel').addEventListener('click', closeCompletarLeadModal);
  document.getElementById('cl-lead-overlay').addEventListener('click', (e)=>{ if(e.target.id==='cl-lead-overlay') closeCompletarLeadModal(); });
  document.getElementById('cl-lead-nome').addEventListener('input', (e)=> completarLeadModalForm.nome = e.target.value);
  document.getElementById('cl-lead-telefone').addEventListener('input', (e)=> completarLeadModalForm.telefone = e.target.value);
  document.getElementById('cl-lead-coluna').addEventListener('change', (e)=> completarLeadModalForm.columnId = e.target.value);
  document.getElementById('cl-lead-valor').addEventListener('input', (e)=> completarLeadModalForm.valor = parseFloat(e.target.value)||0);
  document.getElementById('cl-lead-temp').addEventListener('change', (e)=> completarLeadModalForm.temperatura = e.target.value);
  document.getElementById('cl-lead-salvar').addEventListener('click', salvarCompletarLead);
}

/* ---------- Agendamentos ---------- */
async function loadAgendamentos(){
  try{
    const data = await apiRequest('GET', '/agendamentos');
    agendamentos = data.mensagens || [];
    agendamentosContagem = data.contagem || { pendente:0, enviada:0, cancelada:0, falhou:0 };
  }catch(e){
    agendamentos = [];
  }
  agendamentosLoaded = true;
  renderApp();
}
function agendamentoStatusLabel(status){
  if(status==='enviada') return '✓ Enviada';
  if(status==='cancelada') return 'Cancelada';
  if(status==='falhou') return '⚠ Falhou';
  return '⏳ A enviar';
}
function openNewAgendamento(){
  agendamentoModalForm = { cardId:'', texto:'', data:'', hora:'' };
  agendamentoMsg = null;
  renderAgendamentoModal();
}
function closeAgendamentoModal(){ agendamentoModalForm = null; document.getElementById('modal-root').innerHTML=''; }
async function salvarAgendamento(){
  const f = agendamentoModalForm;
  if(!f.cardId || !f.texto.trim() || !f.data || !f.hora){
    agendamentoMsg = { tipo:'erro', texto:'Preencha o cliente, a data, a hora e a mensagem.' };
    renderAgendamentoModal();
    return;
  }
  const agendadoPara = new Date(`${f.data}T${f.hora}:00`);
  agendamentoSalvando = true;
  agendamentoMsg = null;
  renderAgendamentoModal();
  try{
    await apiRequest('POST', '/agendamentos', { cardId: f.cardId, texto: f.texto, agendadoPara: agendadoPara.toISOString() });
    closeAgendamentoModal();
    await loadAgendamentos();
  }catch(e){
    agendamentoMsg = { tipo:'erro', texto: e.message || 'Não foi possível agendar a mensagem.' };
    agendamentoSalvando = false;
    renderAgendamentoModal();
  }
}
async function cancelarAgendamento(id){
  try{
    await apiRequest('POST', `/agendamentos/${id}/cancelar`);
    await loadAgendamentos();
  }catch(e){
    errorMsg = 'Não foi possível cancelar o agendamento.';
    renderApp();
  }
}
async function excluirAgendamento(id){
  const idx = agendamentos.findIndex(a=>a.id===id);
  if(idx===-1) return;
  const [removido] = agendamentos.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/agendamentos/${id}`);
    await loadAgendamentos(); // recarrega pra atualizar a contagem por status também
  }catch(e){
    agendamentos.splice(idx,0,removido);
    errorMsg = 'Não foi possível excluir o agendamento.';
    renderApp();
  }
}
function renderAgendamentoModal(){
  const root = document.getElementById('modal-root');
  if(!agendamentoModalForm){ root.innerHTML=''; return; }
  const f = agendamentoModalForm;
  const candidatos = board.cards.filter(c=>c.telefone);
  root.innerHTML = `
    <div class="overlay" id="ag-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Nova mensagem agendada</h3>
          <button id="ag-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Cliente</label>
            <select id="ag-cliente">
              <option value="">Selecione</option>
              ${candidatos.map(c=>`<option value="${c.id}" ${f.cardId===c.id?'selected':''}>${esc(c.cliente)}</option>`).join('')}
            </select>
          </div>
          <div class="field-row">
            <div class="field"><label>Data</label><input type="date" id="ag-data" value="${f.data}" /></div>
            <div class="field"><label>Hora</label><input type="time" id="ag-hora" value="${f.hora}" /></div>
          </div>
          <div class="field">
            <label>Mensagem</label>
            <textarea id="ag-texto" rows="4" placeholder="Texto que será enviado pelo WhatsApp...">${esc(f.texto)}</textarea>
          </div>
          ${agendamentoMsg ? `<p class="settings-page-msg ${agendamentoMsg.tipo}">${esc(agendamentoMsg.texto)}</p>` : ''}
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="ag-cancel">Cancelar</button>
            <button class="btn-save" id="ag-salvar" ${agendamentoSalvando?'disabled':''}>${agendamentoSalvando?'Agendando…':'Agendar'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('ag-modal-close').addEventListener('click', closeAgendamentoModal);
  document.getElementById('ag-cancel').addEventListener('click', closeAgendamentoModal);
  document.getElementById('ag-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='ag-modal-overlay') closeAgendamentoModal(); });
  document.getElementById('ag-cliente').addEventListener('change', (e)=> agendamentoModalForm.cardId = e.target.value);
  document.getElementById('ag-data').addEventListener('input', (e)=> agendamentoModalForm.data = e.target.value);
  document.getElementById('ag-hora').addEventListener('input', (e)=> agendamentoModalForm.hora = e.target.value);
  document.getElementById('ag-texto').addEventListener('input', (e)=> agendamentoModalForm.texto = e.target.value);
  document.getElementById('ag-salvar').addEventListener('click', salvarAgendamento);
}

async function criarEquipe(){
  const nome = equipeNomeNovo.trim();
  if(!nome){ equipeMsg = { tipo:'erro', texto:'Digite um nome para a equipe.' }; renderApp(); return; }
  try{
    await apiRequest('POST', '/equipe', { nome });
    equipeNomeNovo = '';
    equipeMsg = null;
    await loadEquipe();
  }catch(e){
    equipeMsg = { tipo:'erro', texto: e.message || 'Não foi possível criar a equipe.' };
    renderApp();
  }
}
async function entrarNaEquipe(){
  const codigo = equipeCodigoEntrar.trim();
  if(!codigo){ equipeMsg = { tipo:'erro', texto:'Digite o código de convite.' }; renderApp(); return; }
  try{
    await apiRequest('POST', '/equipe/entrar', { codigo });
    equipeCodigoEntrar = '';
    equipeMsg = null;
    await loadEquipe();
  }catch(e){
    equipeMsg = { tipo:'erro', texto: e.message || 'Não foi possível entrar na equipe.' };
    renderApp();
  }
}
async function sairDaEquipe(){
  try{
    await apiRequest('POST', '/equipe/sair');
    equipe = null;
    chatMensagens = [];
    chatLoaded = false;
    supervisaoMembros = [];
    supervisaoLoaded = false;
    renderApp();
  }catch(e){
    errorMsg = 'Não foi possível sair da equipe.';
    renderApp();
  }
}
async function regenerarCodigoEquipe(){
  try{
    const data = await apiRequest('POST', '/equipe/regenerar-codigo');
    if(equipe) equipe.codigoConvite = data.codigoConvite;
  }catch(e){
    errorMsg = 'Não foi possível gerar um novo código.';
  }
  renderApp();
}
async function alterarPapelMembro(userId, papel){
  try{
    await apiRequest('PUT', `/equipe/membro/${userId}/papel`, { papel });
    await loadEquipe();
  }catch(e){
    errorMsg = 'Não foi possível alterar o papel do membro.';
    renderApp();
  }
}
async function alterarSupervisorDeDados(userId, ativo){
  try{
    await apiRequest('PUT', `/equipe/membro/${userId}/supervisor-dados`, { ativo });
    await loadEquipe();
  }catch(e){
    errorMsg = 'Não foi possível alterar o acesso de supervisor de dados.';
    renderApp();
  }
}
async function removerMembro(userId){
  try{
    await apiRequest('DELETE', `/equipe/membro/${userId}`);
    await loadEquipe();
  }catch(e){
    errorMsg = 'Não foi possível remover o membro.';
    renderApp();
  }
}
async function enviarMensagemChat(){
  if(!chatTexto.trim()) return;
  chatEnviando = true;
  renderApp();
  try{
    await apiRequest('POST', '/equipe/chat', { texto: chatTexto });
    chatTexto = '';
    await loadChat();
  }catch(e){
    errorMsg = e.message || 'Não foi possível enviar a mensagem.';
  }
  chatEnviando = false;
  renderApp();
}
async function abrirConversaIndividual(userId){
  dmDestinatarioId = userId;
  dmLoaded = false;
  dmMensagens = [];
  renderApp();
  try{
    const data = await apiRequest('GET', `/equipe/chat/${userId}`);
    dmMensagens = data.mensagens || [];
  }catch(e){
    dmMensagens = [];
    errorMsg = e.message || 'Não foi possível carregar a conversa.';
  }
  dmLoaded = true;
  renderApp();
}
async function enviarMensagemIndividual(){
  if(!dmTexto.trim() || !dmDestinatarioId) return;
  dmEnviando = true;
  renderApp();
  try{
    await apiRequest('POST', `/equipe/chat/${dmDestinatarioId}`, { texto: dmTexto });
    dmTexto = '';
    const data = await apiRequest('GET', `/equipe/chat/${dmDestinatarioId}`);
    dmMensagens = data.mensagens || [];
  }catch(e){
    errorMsg = e.message || 'Não foi possível enviar a mensagem.';
  }
  dmEnviando = false;
  renderApp();
}

// Notificações são calculadas na hora, a partir do que já está carregado
// (tarefas, leads e conversas) — não existe uma tabela própria pra isso.
function computarNotificacoes(){
  const notifs = [];
  const fimHoje = new Date(); fimHoje.setHours(23,59,59,999);
  tasks.forEach(t=>{
    if(!t.concluida && t.vencimento && new Date(t.vencimento) <= fimHoje){
      notifs.push({ texto:`Tarefa: ${t.titulo}`, timestamp: t.vencimento, cardId: t.leadId || null });
    }
  });
  const ontem = new Date(Date.now() - 24*60*60*1000);
  board.cards.forEach(c=>{
    if(c.createdAt && new Date(c.createdAt) >= ontem){
      notifs.push({ texto:`Novo lead: ${c.cliente}`, timestamp:c.createdAt, cardId:c.id });
    }
  });
  const doisDias = new Date(Date.now() - 48*60*60*1000);
  conversas.forEach(cv=>{
    if(cv.direcaoUltima==='in' && cv.ultimaMensagemEm && new Date(cv.ultimaMensagemEm) >= doisDias){
      notifs.push({ texto:`${cv.card.cliente}: ${(cv.ultimaMensagem||'').slice(0,60)}`, timestamp:cv.ultimaMensagemEm, cardId:cv.card.id });
    }
  });
  return notifs.sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));
}

/* ---------- Disparos (mensagem em massa) ---------- */
async function enviarDisparo(){
  if(disparoSelecionados.size===0) return;
  if(disparoUsarTemplate){
    if(!disparoTemplateNome.trim()) return;
  } else if(!disparoTexto.trim()){
    return;
  }
  disparoEnviando = true;
  disparoResultado = null;
  renderApp();
  try{
    const corpo = { cardIds: Array.from(disparoSelecionados) };
    if(disparoUsarTemplate){
      corpo.usarTemplate = true;
      corpo.templateName = disparoTemplateNome.trim();
      corpo.idioma = disparoTemplateIdioma.trim() || 'pt_BR';
      corpo.variaveis = disparoTemplateVariaveis.trim() ? disparoTemplateVariaveis.split(',').map(v=>v.trim()) : [];
    } else {
      corpo.texto = disparoTexto;
    }
    const data = await apiRequest('POST', '/whatsapp/disparo', corpo);
    disparoResultado = data;
  }catch(e){
    errorMsg = e.message || 'Não foi possível enviar os disparos.';
  }
  disparoEnviando = false;
  renderApp();
}
async function carregarTemplatesDisponiveis(){
  try{
    const data = await apiRequest('GET', '/whatsapp/templates');
    disparoTemplatesDisponiveis = (data.templates || []).filter(t=>t.status==='APPROVED');
  }catch(e){
    errorMsg = e.message || 'Não foi possível carregar os modelos.';
  }
  renderApp();
}

/* ---------- Templates (página) ---------- */
function renderMenuTriagemOpcao(op, idx){
  return `
    <div class="mt-opcao-card">
      <div class="field-row">
        <div class="field mt-opcao-numero-field">
          <label>Número</label>
          <input type="text" class="mt-opcao-numero" data-idx="${idx}" value="${esc(op.numero)}" maxlength="3" />
        </div>
        <div class="field" style="flex:1;">
          <label>Coluna de destino</label>
          <select class="mt-opcao-coluna" data-idx="${idx}">
            ${board.columns.map(c=>`<option value="${c.id}" ${op.colunaDestinoId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
          </select>
        </div>
        <button type="button" class="icon-btn mt-opcao-remover" data-idx="${idx}" title="Remover opção">${ICON_TRASH}</button>
      </div>
      <div class="field">
        <label>Mensagem de confirmação (opcional)</label>
        <input type="text" class="mt-opcao-confirmacao" data-idx="${idx}" value="${esc(op.respostaConfirmacao||'')}" placeholder="Ex: Perfeito! Já te chamo por aqui." />
      </div>
    </div>
  `;
}
function statusTemplateLabel(status){
  if(status==='APPROVED') return '✓ Aprovado';
  if(status==='PENDING') return '⏳ Em análise';
  if(status==='REJECTED') return '✕ Rejeitado';
  return status || '—';
}

/* ---------- Campos personalizados ---------- */
async function toggleAgendamentoPublicoAtivo(){
  agendamentoPublicoForm.ativo = !agendamentoPublicoForm.ativo;
  renderApp();
}
async function salvarAgendamentoPublico(){
  agendamentoPublicoForm.horaInicio = document.getElementById('ap-hora-inicio').value || agendamentoPublicoForm.horaInicio;
  agendamentoPublicoForm.horaFim = document.getElementById('ap-hora-fim').value || agendamentoPublicoForm.horaFim;
  agendamentoPublicoForm.duracaoMinutos = Number(document.getElementById('ap-duracao').value);
  agendamentoPublicoForm.diasSemana = [...document.querySelectorAll('.ap-dia-semana:checked')].map(el=>Number(el.value));
  agendamentoPublicoForm.colunaDestinoId = document.getElementById('ap-coluna-destino').value;
  try{
    const data = await apiRequest('PUT', '/auth/agendamento-publico', agendamentoPublicoForm);
    currentUser = data.user;
    localStorage.setItem('user', JSON.stringify(currentUser));
    agendamentoPublicoMsg = { tipo:'ok', texto:'Configuração salva.' };
  }catch(e){
    agendamentoPublicoMsg = { tipo:'erro', texto: e.message || 'Não foi possível salvar.' };
  }
  renderApp();
}
function copiarLinkAgendamento(){
  const link = `${window.location.origin}/agendar/${currentUser.id}`;
  navigator.clipboard.writeText(link).then(()=>{
    agendamentoPublicoMsg = { tipo:'ok', texto:'Link copiado!' };
    renderApp();
  });
}
async function loadWebhooksSaida(){
  try{
    const data = await apiRequest('GET', '/webhooks-saida');
    webhooksSaida = data.webhooks || [];
  }catch(e){
    webhooksSaida = [];
  }
  renderApp();
}
async function criarWebhookSaida(){
  const nome = document.getElementById('novo-webhook-nome').value;
  const url = document.getElementById('novo-webhook-url').value;
  const eventos = [...document.querySelectorAll('.novo-webhook-evento:checked')].map(el=>el.value);
  if(!url.trim() || !eventos.length){
    webhooksSaidaMsg = { tipo:'erro', texto:'Preencha a URL e escolha ao menos um evento.' };
    renderApp();
    return;
  }
  try{
    const novo = await apiRequest('POST', '/webhooks-saida', { nome, url, eventos });
    webhooksSaida.unshift(novo);
    webhooksSaidaMsg = { tipo:'ok', texto:'Webhook criado.' };
  }catch(e){
    webhooksSaidaMsg = { tipo:'erro', texto: e.message || 'Não foi possível criar o webhook.' };
  }
  renderApp();
}
async function toggleWebhookSaida(id, ativo){
  try{
    const atualizado = await apiRequest('PUT', `/webhooks-saida/${id}`, { ativo });
    const idx = webhooksSaida.findIndex(w=>w.id===id);
    if(idx>-1) webhooksSaida[idx] = atualizado;
  }catch(e){
    webhooksSaidaMsg = { tipo:'erro', texto:'Não foi possível alterar o webhook.' };
  }
  renderApp();
}
async function excluirWebhookSaida(id){
  showConfirm({
    message: 'Remover esse webhook? Ele para de disparar imediatamente.',
    confirmLabel: 'Remover',
    onConfirm: async ()=>{
      closeConfirm();
      try{
        await apiRequest('DELETE', `/webhooks-saida/${id}`);
        webhooksSaida = webhooksSaida.filter(w=>w.id!==id);
      }catch(e){
        webhooksSaidaMsg = { tipo:'erro', texto:'Não foi possível remover o webhook.' };
      }
      renderApp();
    },
  });
}
async function testarWebhookSaida(id){
  webhooksSaidaMsg = { tipo:'ok', texto:'Enviando teste…' };
  renderApp();
  try{
    await apiRequest('POST', `/webhooks-saida/${id}/testar`);
    webhooksSaidaMsg = { tipo:'ok', texto:'Teste enviado — confira do outro lado.' };
  }catch(e){
    webhooksSaidaMsg = { tipo:'erro', texto: e.message || 'Não foi possível testar esse webhook agora.' };
  }
  renderApp();
}
async function loadCamposPersonalizados(){
  try{
    const data = await apiRequest('GET', '/campos-personalizados');
    camposPersonalizados = data.campos || [];
  }catch(e){
    camposPersonalizados = [];
  }
  camposPersonalizadosCarregados = true;
  renderApp();
}
async function criarCampoPersonalizado(){
  const nome = novoCampoNome.trim();
  if(!nome){
    camposPersonalizadosMsg = { tipo:'erro', texto:'Digite um nome pro campo.' };
    renderApp();
    return;
  }
  try{
    const novo = await apiRequest('POST', '/campos-personalizados', { nome, tipo: novoCampoTipo });
    camposPersonalizados.push(novo);
    novoCampoNome = '';
    camposPersonalizadosMsg = null;
  }catch(e){
    camposPersonalizadosMsg = { tipo:'erro', texto: e.message || 'Não foi possível criar o campo.' };
  }
  renderApp();
}
async function excluirCampoPersonalizado(id){
  const idx = camposPersonalizados.findIndex(c=>c.id===id);
  if(idx===-1) return;
  const [removido] = camposPersonalizados.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/campos-personalizados/${id}`);
  }catch(e){
    camposPersonalizados.splice(idx,0,removido);
    errorMsg = 'Não foi possível excluir o campo.';
    renderApp();
  }
}

/* ---------- Histórico de contato (dentro do card) ---------- */
async function loadHistoricoContato(cardId){
  try{
    const data = await apiRequest('GET', `/historico-contato/${cardId}`);
    historicoContatoItens = data.itens || [];
  }catch(e){
    historicoContatoItens = [];
  }
  historicoContatoCarregado = true;
  const lista = document.getElementById('f-historico-lista');
  if(lista){
    lista.innerHTML = renderHistoricoContatoListaHtml();
    ligarBindingsHistoricoContato();
  }
}
function renderHistoricoContatoListaHtml(){
  if(!historicoContatoItens.length) return '<p class="dash-empty">Nenhum registro ainda.</p>';
  return `<div class="historico-lista">${historicoContatoItens.map(i=>{
    if(historicoContatoEditandoId === i.id){
      return `
    <div class="historico-item">
      <div class="field-row-flex" style="flex:1;">
        <input type="text" id="historico-edit-input-${i.id}" value="${esc(i.texto)}" />
        <button class="btn-primary" data-action="salvar-edicao-historico" data-id="${i.id}">Salvar</button>
        <button class="btn-outline" data-action="cancelar-edicao-historico">Cancelar</button>
      </div>
    </div>`;
    }
    return `
    <div class="historico-item">
      <div style="flex:1;">
        <span class="historico-item-texto">${esc(i.texto)}</span>
        <span class="historico-item-data">${formatDateHora(i.createdAt)}</span>
      </div>
      <button class="icon-btn" data-action="editar-historico-contato" data-id="${i.id}" title="Editar">✎</button>
      <button class="icon-btn" data-action="excluir-historico-contato" data-id="${i.id}" title="Excluir">${ICON_TRASH}</button>
    </div>`;
  }).join('')}</div>`;
}
function ligarBindingsHistoricoContato(){
  document.querySelectorAll('[data-action="excluir-historico-contato"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      const idx = historicoContatoItens.findIndex(i=>i.id===id);
      if(idx===-1) return;
      const [removido] = historicoContatoItens.splice(idx,1);
      const lista = document.getElementById('f-historico-lista');
      if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
      try{
        await apiRequest('DELETE', `/historico-contato/${id}`);
      }catch(e){
        historicoContatoItens.splice(idx,0,removido);
        errorMsg = 'Não foi possível excluir o registro.';
        if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
      }
    });
  });
  document.querySelectorAll('[data-action="editar-historico-contato"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      historicoContatoEditandoId = btn.dataset.id;
      const lista = document.getElementById('f-historico-lista');
      if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
      const input = document.getElementById(`historico-edit-input-${historicoContatoEditandoId}`);
      if(input){ input.focus(); input.select(); }
    });
  });
  document.querySelectorAll('[data-action="cancelar-edicao-historico"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      historicoContatoEditandoId = null;
      const lista = document.getElementById('f-historico-lista');
      if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
    });
  });
  document.querySelectorAll('[data-action="salvar-edicao-historico"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      const input = document.getElementById(`historico-edit-input-${id}`);
      const novoTexto = input ? input.value.trim() : '';
      if(!novoTexto) return;
      const idx = historicoContatoItens.findIndex(i=>i.id===id);
      if(idx===-1) return;
      const anterior = historicoContatoItens[idx].texto;
      historicoContatoItens[idx].texto = novoTexto;
      historicoContatoEditandoId = null;
      const lista = document.getElementById('f-historico-lista');
      if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
      try{
        await apiRequest('PUT', `/historico-contato/${id}`, { texto: novoTexto });
      }catch(e){
        historicoContatoItens[idx].texto = anterior;
        errorMsg = 'Não foi possível editar o registro.';
        if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
      }
    });
  });
}
async function adicionarHistoricoContato(){
  const texto = historicoContatoTexto.trim();
  if(!texto || !modalForm || modalForm.__isNew) return;
  historicoContatoEnviando = true;
  const input = document.getElementById('historico-input');
  if(input) input.disabled = true;
  try{
    const novo = await apiRequest('POST', '/historico-contato', { cardId: modalForm.id, texto });
    historicoContatoItens.unshift(novo);
    historicoContatoTexto = '';
    const lista = document.getElementById('f-historico-lista');
    if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
    if(input){ input.value = ''; }
  }catch(e){
    errorMsg = 'Não foi possível salvar o registro.';
    renderApp();
  }
  historicoContatoEnviando = false;
  if(input) input.disabled = false;
}
function formatarTamanhoArquivo(bytes){
  if(!bytes) return '0 KB';
  if(bytes < 1024*1024) return `${Math.round(bytes/1024)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}
async function loadAnexosDoCard(cardId){
  try{
    const data = await apiRequest('GET', `/cards/${cardId}/anexos`);
    anexosDoCard = data.anexos || [];
  }catch(e){
    anexosDoCard = [];
  }
  anexosCarregados = true;
  const lista = document.getElementById('f-anexos-lista');
  if(lista){
    lista.innerHTML = renderAnexosListaHtml();
    ligarBindingsAnexos();
  }
}
function renderAnexosListaHtml(){
  const msgHtml = anexoMsg ? `<p class="settings-page-msg ${anexoMsg.tipo}">${esc(anexoMsg.texto)}</p>` : '';
  if(!anexosDoCard.length) return `${msgHtml}<p class="settings-page-note">Nenhum anexo ainda.</p>`;
  return `
    ${msgHtml}
    <div class="anexos-lista">
      ${anexosDoCard.map(a=>`
        <div class="anexo-item">
          <a href="${a.dadosBase64}" download="${esc(a.nomeArquivo)}" class="anexo-item-nome">📎 ${esc(a.nomeArquivo)}</a>
          <span class="settings-page-note">${formatarTamanhoArquivo(a.tamanho)}</span>
          <button type="button" class="icon-btn" data-action="excluir-anexo" data-anexo-id="${a.id}" title="Excluir">${ICON_TRASH}</button>
        </div>
      `).join('')}
    </div>
  `;
}
function ligarBindingsAnexos(){
  document.querySelectorAll('[data-action="excluir-anexo"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const anexoId = btn.dataset.anexoId;
      btn.disabled = true;
      try{
        await apiRequest('DELETE', `/cards/${modalForm.id}/anexos/${anexoId}`);
        anexosDoCard = anexosDoCard.filter(a=>a.id!==anexoId);
        const lista = document.getElementById('f-anexos-lista');
        if(lista){ lista.innerHTML = renderAnexosListaHtml(); ligarBindingsAnexos(); }
      }catch(e){
        errorMsg = 'Não foi possível excluir o anexo.';
        renderApp();
      }
    });
  });
}
function lerArquivoComoBase64(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=> resolve(e.target.result);
    reader.onerror = ()=> reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}
async function handleAnexoFileSelected(file){
  if(!file || !modalForm || modalForm.__isNew) return;
  const btn = document.getElementById('anexo-upload-btn');
  const lista = document.getElementById('f-anexos-lista');
  if(file.size > 3.2 * 1024 * 1024){
    anexoMsg = { tipo:'erro', texto:'Arquivo muito grande. O limite é de aproximadamente 3 MB.' };
    if(lista){ lista.innerHTML = renderAnexosListaHtml(); ligarBindingsAnexos(); }
    return;
  }
  anexoEnviando = true;
  anexoMsg = null;
  if(btn){ btn.disabled = true; btn.textContent = 'Enviando…'; }
  if(lista){ lista.innerHTML = renderAnexosListaHtml(); ligarBindingsAnexos(); }
  try{
    const dadosBase64 = await lerArquivoComoBase64(file);
    const novo = await apiRequest('POST', `/cards/${modalForm.id}/anexos`, {
      nomeArquivo: file.name, tipoMime: file.type, dadosBase64,
    });
    anexosDoCard.unshift(novo);
    anexoMsg = { tipo:'ok', texto:'Anexo enviado.' };
  }catch(e){
    anexoMsg = { tipo:'erro', texto: e.message || 'Não foi possível enviar o anexo.' };
  }
  anexoEnviando = false;
  if(btn){ btn.disabled = false; btn.textContent = '+ Adicionar anexo'; }
  const listaAtualizada = document.getElementById('f-anexos-lista');
  if(listaAtualizada){ listaAtualizada.innerHTML = renderAnexosListaHtml(); ligarBindingsAnexos(); }
}

async function loadTemplates(){
  try{
    const data = await apiRequest('GET', '/whatsapp/templates');
    templatesList = data.templates || [];
  }catch(e){
    templatesList = [];
  }
  templatesCarregados = true;
  renderApp();
}
async function sincronizarTemplates(){
  templatesSincronizando = true;
  templatesMsg = null;
  renderApp();
  try{
    const data = await apiRequest('GET', '/whatsapp/templates');
    templatesList = data.templates || [];
    templatesMsg = { tipo:'ok', texto:'Lista atualizada.' };
  }catch(e){
    templatesMsg = { tipo:'erro', texto: e.message || 'Não foi possível sincronizar.' };
  }
  templatesSincronizando = false;
  renderApp();
}
function openNewTemplateModal(){
  templateModalForm = { nome:'', categoria:'MARKETING', idioma:'pt_BR', texto:'' };
  templateMsg = null;
  renderTemplateModal();
}
function closeTemplateModal(){ templateModalForm = null; document.getElementById('modal-root').innerHTML=''; }
async function enviarNovoTemplate(){
  const f = templateModalForm;
  if(!f.nome.trim() || !f.texto.trim()){
    templateMsg = { tipo:'erro', texto:'Preencha o nome e o texto da mensagem.' };
    renderTemplateModal();
    return;
  }
  templateSalvando = true;
  templateMsg = null;
  renderTemplateModal();
  try{
    await apiRequest('POST', '/whatsapp/templates', {
      nome: f.nome, categoria: f.categoria, idioma: f.idioma || 'pt_BR', texto: f.texto,
    });
    closeTemplateModal();
    await loadTemplates();
  }catch(e){
    templateMsg = { tipo:'erro', texto: e.message || 'Não foi possível enviar o template.' };
    templateSalvando = false;
    renderTemplateModal();
  }
}
function renderTemplateModal(){
  const root = document.getElementById('modal-root');
  if(!templateModalForm){ root.innerHTML=''; return; }
  const f = templateModalForm;
  root.innerHTML = `
    <div class="overlay" id="tpl-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Novo template</h3>
          <button id="tpl-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Nome (só letras minúsculas e "_", sem espaço)</label>
            <input type="text" id="tpl-nome" value="${esc(f.nome)}" placeholder="Ex: boas_vindas" />
          </div>
          <div class="field">
            <label>Categoria</label>
            <select id="tpl-categoria">
              <option value="MARKETING" ${f.categoria==='MARKETING'?'selected':''}>Marketing</option>
              <option value="UTILITY" ${f.categoria==='UTILITY'?'selected':''}>Utilidade</option>
              <option value="AUTHENTICATION" ${f.categoria==='AUTHENTICATION'?'selected':''}>Autenticação</option>
            </select>
          </div>
          <div class="field">
            <label>Idioma</label>
            <input type="text" id="tpl-idioma" value="${esc(f.idioma)}" placeholder="pt_BR" />
          </div>
          <div class="field">
            <label>Texto da mensagem</label>
            <textarea id="tpl-texto" rows="4" placeholder="Use {{1}}, {{2}} pra variáveis. Ex: Olá {{1}}, sua proposta está pronta!">${esc(f.texto)}</textarea>
          </div>
          <p class="settings-page-note">Depois de enviado, a Meta pode levar de minutos a alguns dias pra aprovar. Use "Sincronizar" na lista pra ver o status atualizado.</p>
          ${templateMsg ? `<p class="settings-page-msg ${templateMsg.tipo}">${esc(templateMsg.texto)}</p>` : ''}
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="tpl-cancel">Cancelar</button>
            <button class="btn-save" id="tpl-enviar" ${templateSalvando?'disabled':''}>${templateSalvando?'Enviando…':'Enviar pra aprovação'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('tpl-modal-close').addEventListener('click', closeTemplateModal);
  document.getElementById('tpl-cancel').addEventListener('click', closeTemplateModal);
  document.getElementById('tpl-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='tpl-modal-overlay') closeTemplateModal(); });
  document.getElementById('tpl-nome').addEventListener('input', (e)=> templateModalForm.nome = e.target.value);
  document.getElementById('tpl-categoria').addEventListener('change', (e)=> templateModalForm.categoria = e.target.value);
  document.getElementById('tpl-idioma').addEventListener('input', (e)=> templateModalForm.idioma = e.target.value);
  document.getElementById('tpl-texto').addEventListener('input', (e)=> templateModalForm.texto = e.target.value);
  document.getElementById('tpl-enviar').addEventListener('click', enviarNovoTemplate);
}

/* ---------- Relatórios ---------- */
function relatoriosDadosMensais(mesesAtras, cardsBase){
  const cards = cardsBase || board.cards;
  const buckets = [];
  const agora = new Date();
  for(let i=mesesAtras-1;i>=0;i--){
    const d = new Date(agora.getFullYear(), agora.getMonth()-i, 1);
    buckets.push({ key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, novos:0, ganhoValor:0, ganhoQtd:0 });
  }
  const porKey = new Map(buckets.map(b=>[b.key,b]));
  cards.forEach(c=>{
    if(c.createdAt){
      const bucket = porKey.get(c.createdAt.slice(0,7));
      if(bucket) bucket.novos++;
    }
    if(c.mes){
      const bucketGanho = porKey.get(c.mes.slice(0,7));
      const col = board.columns.find(k=>k.id===c.columnId);
      if(bucketGanho && col && col.tipo==='ganho'){
        bucketGanho.ganhoValor += Number(c.valor)||0;
        bucketGanho.ganhoQtd++;
      }
    }
  });
  return buckets;
}
function baixarCsv(cards, nomeArquivo){
  const linhas = [['Nome','Telefone','Valor','Coluna','Temperatura','Início de contato','Mês de venda'].join(',')];
  cards.forEach(c=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    linhas.push([
      `"${(c.cliente||'').replace(/"/g,'""')}"`,
      `"${(c.telefone||'').replace(/"/g,'""')}"`,
      c.valor||0,
      `"${col?col.nome.replace(/"/g,'""'):''}"`,
      c.temperatura||'',
      c.mesInicioContato||'',
      c.mes||'',
    ].join(','));
  });
  const blob = new Blob([linhas.join('\n')], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function exportarCsv(){
  baixarCsv(cardsParaRelatorio(), `leads_${currentMonthKey()}.csv`);
}
function exportarRelatorioPdf(){
  const cardsRel = cardsParaRelatorio();
  const dados = relatoriosDadosMensais(6, cardsRel);
  const totalGanho = cardsRel.reduce((s,c)=>{ const col=board.columns.find(k=>k.id===c.columnId); return col&&col.tipo==='ganho' ? s+(Number(c.valor)||0) : s; },0);
  const totalPerdido = cardsRel.reduce((s,c)=>{ const col=board.columns.find(k=>k.id===c.columnId); return col&&col.tipo==='perdido' ? s+(Number(c.valor)||0) : s; },0);
  const porTemp = ['quente','morno','frio'].map(t=>({ temp:t, count: cardsRel.filter(c=>c.temperatura===t).length }));
  const funilNome = relatorioFunilId ? ((funis.find(f=>f.id===relatorioFunilId)||{}).nome || '') : 'Todos os funis';

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;
  doc.setFontSize(18);
  doc.text('Relatório — Painel CRM', 14, y); y += 7;
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`${funilNome} — gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, y); y += 12;
  doc.setTextColor(20);

  doc.setFontSize(13);
  doc.text('Resumo', 14, y); y += 8;
  doc.setFontSize(11);
  doc.text(`Total ganho: ${fmtBRL(totalGanho)}`, 14, y); y += 6;
  doc.text(`Total perdido: ${fmtBRL(totalPerdido)}`, 14, y); y += 6;
  doc.text(`Total de leads: ${cardsRel.length}`, 14, y); y += 12;

  doc.setFontSize(13);
  doc.text('Novos leads por mês', 14, y); y += 8;
  doc.setFontSize(11);
  dados.forEach(d=>{
    doc.text(`${monthLabel(d.key)}: ${d.novos}`, 14, y); y += 6;
  });
  y += 6;

  doc.setFontSize(13);
  doc.text('Leads por qualificação', 14, y); y += 8;
  doc.setFontSize(11);
  porTemp.forEach(t=>{
    doc.text(`${TEMPS[t.temp].label}: ${t.count}`, 14, y); y += 6;
  });

  doc.save(`relatorio_${currentMonthKey()}.pdf`);
}
function exportarLeads(){
  baixarCsv(filteredLeads(), `contatos_${currentMonthKey()}.csv`);
}
async function connectGoogleCalendar(){
  try{
    const data = await apiRequest('GET', '/calendar/connect-url');
    window.location.href = data.url;
  }catch(e){
    errorMsg = 'Não foi possível iniciar a conexão com a Google Agenda.';
    renderApp();
  }
}
async function disconnectGoogleCalendar(){
  try{
    await apiRequest('POST', '/calendar/disconnect');
    calendarConnected = false;
  }catch(e){
    errorMsg = 'Não foi possível desconectar da Google Agenda.';
  }
  renderApp();
}
function abrirBackupModal(){
  backupModalAberto = true;
  backupMsg = null;
  renderBackupModal();
}
function closeBackupModal(){
  backupModalAberto = false;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function renderBackupModal(){
  const root = document.getElementById('modal-root');
  if(!backupModalAberto){ root.innerHTML=''; return; }
  root.innerHTML = `
    <div class="overlay" id="backup-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Backup dos seus dados</h3>
          <button id="backup-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <p class="settings-page-note">Guarda ou restaura uma cópia de todos os seus clientes, tarefas, comissões, mensagens e configurações.</p>
          ${backupMsg ? `<p class="settings-page-msg ${backupMsg.tipo}">${esc(backupMsg.texto)}</p>` : ''}
          <div class="backup-opcoes-row" style="margin-top:14px;">
            <div class="backup-opcao-card">
              <div class="backup-opcao-titulo">⬇ Exportar</div>
              <p class="settings-page-note">Baixa um arquivo .json com tudo, pra guardar num lugar seguro (Google Drive, por exemplo).</p>
              <button class="btn-outline" id="backup-modal-exportar" ${backupGerando?'disabled':''}>${backupGerando?'Gerando…':'Baixar backup completo'}</button>
            </div>
            <div class="backup-opcao-card">
              <div class="backup-opcao-titulo">⬆ Importar</div>
              <p class="settings-page-note">Restaura a partir de um arquivo .json de backup — atualiza o que já existe e cria o que estiver faltando, sem apagar nada.</p>
              <input type="file" id="backup-import-input" accept="application/json" style="display:none;" />
              <button class="btn-outline" id="backup-modal-importar" ${backupImportando?'disabled':''}>${backupImportando?'Importando…':'Escolher arquivo e restaurar'}</button>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="backup-modal-fechar">Fechar</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('backup-modal-close').addEventListener('click', closeBackupModal);
  document.getElementById('backup-modal-fechar').addEventListener('click', closeBackupModal);
  document.getElementById('backup-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='backup-modal-overlay') closeBackupModal(); });
  document.getElementById('backup-modal-exportar').addEventListener('click', baixarBackupCompleto);
  document.getElementById('backup-modal-importar').addEventListener('click', escolherArquivoBackup);
  document.getElementById('backup-import-input').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    e.target.value = '';
    importarArquivoBackup(file);
  });
}
function escolherArquivoBackup(){
  const input = document.getElementById('backup-import-input');
  if(input) input.click();
}
async function importarArquivoBackup(file){
  if(!file) return;
  showConfirm({
    message: 'Restaurar esse backup? Isso atualiza clientes, tarefas e outros dados que já existirem com o mesmo identificador, e cria o que estiver faltando. Nada é apagado.',
    confirmLabel: 'Restaurar',
    danger: false,
    onConfirm: async ()=>{
      closeConfirm();
      backupImportando = true;
      backupMsg = null;
      renderApp();
      if(backupModalAberto) renderBackupModal();
      try{
        const texto = await file.text();
        const dados = JSON.parse(texto);
        const token = getToken();
        const res = await fetch(API_BASE + '/backup/importar-tudo', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify(dados),
        });
        const resposta = await res.json();
        if(!res.ok) throw new Error(resposta.error || 'Não foi possível importar o backup.');
        const totalOk = Object.values(resposta.resultado||{}).reduce((s,r)=>s+(r.ok||0),0);
        const totalErro = Object.values(resposta.resultado||{}).reduce((s,r)=>s+(r.erro||0),0);
        backupMsg = { tipo:'ok', texto: `Backup restaurado: ${totalOk} registro(s) atualizado(s)${totalErro?`, ${totalErro} com erro`:''}.` };
        // recarrega os dados principais da tela, já que podem ter mudado
        await Promise.all([loadBoard(), loadTasks(), loadContratos()]);
      }catch(e){
        backupMsg = { tipo:'erro', texto: e.message || 'Arquivo inválido ou erro ao importar.' };
      }
      backupImportando = false;
      renderApp();
      if(backupModalAberto) renderBackupModal();
    },
  });
}
async function baixarBackupCompleto(){
  if(backupGerando) return;
  backupGerando = true;
  backupMsg = null;
  renderApp();
  if(backupModalAberto) renderBackupModal();
  try{
    const token = getToken();
    const res = await fetch(API_BASE + '/backup/exportar-tudo', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if(!res.ok) throw new Error('Não foi possível gerar o backup agora.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-painel-crm-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }catch(e){
    backupMsg = { tipo:'erro', texto: e.message || 'Não foi possível gerar o backup agora.' };
  }
  backupGerando = false;
  renderApp();
  if(backupModalAberto) renderBackupModal();
}
async function preencherMesInicioContatoAntigos(){
  preenchendoMesInicioContato = true;
  mesInicioContatoMsg = null;
  renderApp();
  try{
    const data = await apiRequest('POST', '/cards/preencher-mes-inicio-contato');
    // atualiza localmente também, sem precisar recarregar tudo do servidor de novo
    board.cards.forEach(c=>{ if(!c.mesInicioContato && c.mes) c.mesInicioContato = c.mes; });
    mesInicioContatoMsg = { tipo:'ok', texto: data.atualizados
      ? `${data.atualizados} lead(s) atualizado(s).`
      : 'Nenhum lead precisava de atualização — todos já tinham esse campo preenchido.' };
  }catch(e){
    mesInicioContatoMsg = { tipo:'erro', texto:'Não foi possível preencher os leads antigos agora.' };
  }
  preenchendoMesInicioContato = false;
  renderApp();
}
async function verificarAtualizacaoApp(){
  verificandoAtualizacao = true;
  atualizacaoMsg = null;
  renderApp();
  try{
    if('serviceWorker' in navigator){
      const reg = await navigator.serviceWorker.getRegistration();
      if(reg) await reg.update();
    }
    atualizacaoMsg = { tipo:'ok', texto:'Tudo certo! Recarregando a página...' };
    renderApp();
    setTimeout(()=>{ window.location.reload(); }, 700);
  }catch(e){
    atualizacaoMsg = { tipo:'erro', texto:'Não foi possível verificar agora. Tenta fechar e abrir o app de novo.' };
    verificandoAtualizacao = false;
    renderApp();
  }
}
async function syncCalendarNow(){
  if(calendarSyncing) return;
  calendarSyncing = true;
  renderApp();
  try{
    await apiRequest('POST', '/tasks/sync-calendar');
    await loadTasks();
    if(currentPage==='tarefas') await loadAgendaMes(agendaMesAtual); // busca de novo os eventos do Google pro mês em tela
  }catch(e){
    errorMsg = e.message || 'Não foi possível sincronizar com a Google Agenda agora.';
  }
  calendarSyncing = false;
  renderApp();
}
function tratarRetornoDoGoogle(){
  const params = new URLSearchParams(window.location.search);
  const status = params.get('calendar');
  if(!status) return;
  if(status === 'conectado'){ calendarConnected = true; }
  else if(status === 'erro'){ errorMsg = 'Não foi possível conectar com a Google Agenda. Tente novamente.'; }
  window.history.replaceState({}, '', window.location.pathname);
}

/* ---------- derivações (Pipeline) ---------- */
function monthsList(){
  const set = new Set([currentMonthKey(), ...board.cards.map(c=>c.mesInicioContato).filter(Boolean).map(d=>d.slice(0,7))]);
  return Array.from(set).sort((a,b)=> a<b?1:-1);
}
function visibleCards(){
  let cards = filterMonth ? board.cards.filter(c=>c.mesInicioContato && c.mesInicioContato.slice(0,7)===filterMonth) : board.cards;
  cards = cards.filter(c=>!c.arquivado);
  if(filtroEsfriando){
    const limite = Date.now() - 7*24*60*60*1000;
    cards = cards.filter(c=>{
      const col = board.columns.find(k=>k.id===c.columnId);
      if(!col || col.tipo!=='aberto') return false;
      const att = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
      return att < limite;
    });
  }
  return cards;
}
function cardsOf(colId){ return visibleCards().filter(c=>c.columnId===colId).sort((a,b)=> (a.ordem||0) - (b.ordem||0)); }
function sumByTipo(tipo){
  return visibleCards().reduce((s,c)=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    return (col && col.tipo===tipo && col.funilId===funilAtualId) ? s + (Number(c.valor)||0) : s;
  },0);
}
function countByTipo(tipo){
  return visibleCards().filter(c=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    return col && col.tipo===tipo && col.funilId===funilAtualId;
  }).length;
}
function quentesAtivos(){
  return visibleCards().filter(c=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    return col && col.tipo==='aberto' && col.funilId===funilAtualId && c.temperatura==='quente';
  }).length;
}
function cardsDoFunilAtual(){
  return visibleCards().filter(c=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    return col && col.funilId===funilAtualId;
  });
}
function ticketMedioFunil(){
  const cards = cardsDoFunilAtual();
  if(!cards.length) return 0;
  const total = cards.reduce((s,c)=> s + (Number(c.valor)||0), 0);
  return total / cards.length;
}
function valorPonderadoFunil(){
  return cardsDoFunilAtual().reduce((s,c)=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    if(!col || col.tipo!=='aberto') return s;
    const prob = (typeof col.probabilidade === 'number') ? col.probabilidade : 50;
    return s + (Number(c.valor)||0) * (prob/100);
  }, 0);
}

/* ---------- derivações (Dashboard) ---------- */
function periodRange(period){
  const end = new Date();
  const start = new Date();
  if(period === '7dias') start.setDate(start.getDate() - 6);
  else if(period === 'mes') start.setDate(start.getDate() - 29);
  else if(period === 'trimestre') start.setDate(start.getDate() - 89);
  else start.setDate(start.getDate() - 364); // ano
  start.setHours(0,0,0,0);
  return { start, end };
}
function cardsInPeriod(){
  const { start, end } = periodRange(dashboardPeriod);
  return board.cards.filter(c=>{
    if(!c.createdAt) return false;
    const d = new Date(c.createdAt);
    return d >= start && d <= end;
  });
}
function vendidoNoMesAtual(){
  const mesAtual = currentMonthKey();
  return board.cards.reduce((s,c)=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    return (col && col.tipo==='ganho' && c.mes===mesAtual) ? s + (Number(c.valor)||0) : s;
  }, 0);
}
async function loadMetaVendas(){
  try{
    const data = await apiRequest('GET', `/metas/${currentMonthKey()}`);
    metaVendasValor = data.valorMeta || 0;
  }catch(e){
    metaVendasValor = 0;
  }
  metaVendasCarregada = true;
  renderApp();
}
async function salvarMetaVendas(){
  const input = document.getElementById('meta-vendas-input');
  const valor = input ? (parseFloat(input.value) || 0) : 0;
  try{
    await apiRequest('PUT', `/metas/${currentMonthKey()}`, { valorMeta: valor });
    metaVendasValor = valor;
  }catch(e){
    errorMsg = 'Não foi possível salvar a meta.';
  }
  editandoMetaVendas = false;
  renderApp();
}
async function loadMetaVendasEquipe(){
  try{
    const data = await apiRequest('GET', `/equipe/meta-vendas/${currentMonthKey()}`);
    metaVendasEquipeValor = data.valorMeta || 0;
    metaVendasEquipeVendido = data.vendidoNoMes || 0;
  }catch(e){
    metaVendasEquipeValor = 0;
    metaVendasEquipeVendido = 0;
  }
  metaVendasEquipeCarregada = true;
  renderApp();
}
async function salvarMetaVendasEquipe(){
  const input = document.getElementById('meta-vendas-equipe-input');
  const valor = input ? (parseFloat(input.value) || 0) : 0;
  try{
    await apiRequest('PUT', `/equipe/meta-vendas/${currentMonthKey()}`, { valorMeta: valor });
    metaVendasEquipeValor = valor;
  }catch(e){
    errorMsg = 'Não foi possível salvar a meta da equipe.';
  }
  editandoMetaVendasEquipe = false;
  renderApp();
}
function dashMetrics(){
  const cards = cardsInPeriod();
  let emNegociacaoValor=0, emNegociacaoCount=0, ganhoValor=0, ganhoCount=0, perdidoCount=0;
  cards.forEach(c=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    if(!col) return;
    if(col.tipo === 'aberto'){ emNegociacaoValor += Number(c.valor)||0; emNegociacaoCount++; }
    else if(col.tipo === 'ganho'){ ganhoValor += Number(c.valor)||0; ganhoCount++; }
    else if(col.tipo === 'perdido'){ perdidoCount++; }
  });
  const fechados = ganhoCount + perdidoCount;
  const conversao = fechados > 0 ? Math.round((ganhoCount/fechados)*100) : 0;
  return { novosLeads: cards.length, emNegociacaoValor, emNegociacaoCount, ganhoValor, ganhoCount, conversao };
}
function stageTotals(){
  return board.columns.map(col=>{
    const total = board.cards.filter(c=>c.columnId===col.id).reduce((s,c)=> s+(Number(c.valor)||0), 0);
    return { col, total };
  });
}
function leadsPorPeriodoBuckets(){
  const { start, end } = periodRange(dashboardPeriod);
  const cards = cardsInPeriod();
  const totalDays = Math.max(1, Math.round((end-start)/86400000)+1);
  const bucketDays = totalDays > 40 ? 7 : 1;
  const buckets = [];
  for(let t=new Date(start); t<=end; t.setDate(t.getDate()+bucketDays)){
    buckets.push({ date:new Date(t), count:0 });
  }
  if(!buckets.length) buckets.push({ date:new Date(start), count:0 });
  cards.forEach(c=>{
    const d = new Date(c.createdAt);
    for(let i=buckets.length-1;i>=0;i--){
      if(d >= buckets[i].date){ buckets[i].count++; break; }
    }
  });
  return buckets;
}
function renderLeadsChart(){
  const buckets = leadsPorPeriodoBuckets();
  if(!buckets.some(b=>b.count>0)){
    return `<p class="chart-empty">Nenhum lead captado nesse período ainda.</p>`;
  }
  const w=720, h=220, padL=32, padR=12, padT=12, padB=26;
  const innerW = w-padL-padR, innerH = h-padT-padB;
  const maxCount = Math.max(4, ...buckets.map(b=>b.count));
  const stepX = buckets.length>1 ? innerW/(buckets.length-1) : 0;
  const points = buckets.map((b,i)=>({
    x: padL + stepX*i,
    y: padT + innerH - (b.count/maxCount)*innerH,
    b,
  }));
  const path = points.map((p,i)=> (i===0?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ');
  const yTicks = 4;
  const yLabels = Array.from({length:yTicks+1}, (_,i)=> Math.round(maxCount - (maxCount/yTicks)*i));
  const xLabelEvery = Math.max(1, Math.ceil(buckets.length/8));
  return `
    <div class="chart-wrap">
      <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
        ${yLabels.map((v,i)=>{
          const y = padT + (innerH/yTicks)*i;
          return `<line x1="${padL}" y1="${y}" x2="${w-padR}" y2="${y}" stroke="var(--line)" stroke-width="1"/><text x="${padL-8}" y="${y+4}" font-size="10" fill="var(--ink-soft)" text-anchor="end">${v}</text>`;
        }).join('')}
        <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2"/>
        ${points.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="var(--accent)"/>`).join('')}
        ${points.map((p,i)=> i % xLabelEvery === 0 ? `<text x="${p.x.toFixed(1)}" y="${h-6}" font-size="9" fill="var(--ink-soft)" text-anchor="middle">${p.b.date.getDate()}/${p.b.date.getMonth()+1}</text>` : '').join('')}
      </svg>
    </div>
  `;
}

/* ---------- comissões: cálculo e derivações ---------- */
const ESCOPOS = {
  Pessoal: { label:'Pessoal', color:'var(--ink-soft)', bg:'var(--badge-neutral-bg)' },
  Empresa: { label:'Empresa', color:'#FFFFFF',         bg:'var(--accent)' },
};
const REGRAS_COMISSAO_FALLBACK_NOMES = { imovel:'Imóvel', investimento:'Investimento', servicos:'Serviços', veiculo:'Veículo', home_equity:'Home Equity', car_equity:'Car Equity' };
// Gera as <option> de tipo de carta a partir das regras de comissão carregadas — usado
// tanto no formulário do lead quanto no modal de contrato. Enquanto as regras ainda não
// carregaram (ou pra um valor salvo que não bate com nenhuma regra atual, ex: regra
// excluída depois), garante que a opção escolhida sempre apareça, sem sumir do <select>.
// Confere se a regra desse tipo de carta marca o mês como independente do lead — olha
// as regras carregadas do servidor e, se ainda não carregaram, cai no padrão conhecido
// (só Home Equity e Car Equity, historicamente).
function mesIndependenteDoTipo(tipoCarta){
  const regra = regrasComissao.find(r=>r.chave===tipoCarta);
  if(regra) return !!regra.mesIndependente;
  return tipoCarta==='home_equity' || tipoCarta==='car_equity';
}
function textoNotaMesContrato(tipoCarta){
  return mesIndependenteDoTipo(tipoCarta)
    ? 'Essa regra marca o mês como independente (pra pagamentos que podem demorar a acontecer) — mudar o mês aqui não altera o mês do lead.'
    : 'Mudar o mês aqui também atualiza o mês do lead (e vice-versa) — a não ser que a regra desse tipo marque o mês como independente.';
}
function renderOpcoesTipoCarta(valorAtual){
  const lista = regrasComissao.length
    ? regrasComissao
    : Object.keys(REGRAS_COMISSAO_FALLBACK_NOMES).map(chave=>({ chave, nome: REGRAS_COMISSAO_FALLBACK_NOMES[chave] }));
  const opcoes = (valorAtual && !lista.some(r=>r.chave===valorAtual))
    ? [...lista, { chave: valorAtual, nome: valorAtual }]
    : lista;
  return opcoes.map(r=>`<option value="${esc(r.chave)}" ${r.chave===valorAtual?'selected':''}>${esc(r.nome)}</option>`).join('');
}
// Motor genérico por blocos — espelha exatamente o back-end (comissaoCalc.js:
// calcComissaoPorBlocos). Cada bloco é "N parcelas de X% da carta cada". Serve tanto pra
// pré-visualizar um contrato quanto pra simular uma regra sendo editada na engrenagem.
function calcComissaoPorBlocosPreview(creditoValor, blocos){
  const credito = parseFloat(creditoValor) || 0;
  const lista = Array.isArray(blocos) && blocos.length ? blocos : [{ parcelas:1, percentual:0 }];
  return lista.map(b=>({
    parcelas: Math.max(1, parseInt(b.parcelas,10) || 1),
    value: Math.round(credito * (parseFloat(b.percentual)||0) * 100) / 100,
  }));
}
function resumoDeBlocosPreview(blocosCalculados){
  const total = blocosCalculados.reduce((s,b)=> s + b.value*b.parcelas, 0);
  const parcelas = blocosCalculados.reduce((s,b)=> s + b.parcelas, 0);
  const primeiro = blocosCalculados[0] || { parcelas:0, value:0 };
  const segundo = blocosCalculados[1];
  return { blocos:blocosCalculados, parcelas, parcelas1:primeiro.parcelas, value:primeiro.value, value2: segundo?segundo.value:0, total: Math.round(total*100)/100 };
}
// Regras padrão do sistema, só como fallback enquanto as regras do usuário ainda não
// carregaram do servidor (loadRegrasComissao) — assim que carregam, elas mandam.
const REGRAS_COMISSAO_FALLBACK = {
  imovel: [{ parcelas:10, percentual:1033.88/1000000 }, { parcelas:3, percentual:1905.61/1000000 }],
  investimento: [{ parcelas:10, percentual:1033.88/1000000 }, { parcelas:3, percentual:1905.61/1000000 }],
  servicos: [{ parcelas:10, percentual:1033.88/1000000 }, { parcelas:3, percentual:1905.61/1000000 }],
  veiculo: [{ parcelas:11, percentual:0.016/11 }],
  home_equity: [{ parcelas:1, percentual:0.011 }],
  car_equity: [{ parcelas:1, percentual:0.011 }],
};
function calcComissaoPreviewPorTipo(creditoValor, tipoCarta){
  const regra = regrasComissao.find(r=>r.chave===tipoCarta);
  const blocos = regra ? regra.blocos : (REGRAS_COMISSAO_FALLBACK[tipoCarta] || [{ parcelas:1, percentual:0 }]);
  return resumoDeBlocosPreview(calcComissaoPorBlocosPreview(creditoValor, blocos));
}
function atualizarNotaCicloDeVenda(){
  const nota = document.getElementById('f-ciclo-venda-nota');
  if(!nota || !modalForm || modalForm.__isNew) return;
  const texto = textoCicloDeVenda(modalForm.mesInicioContato, modalForm.mes);
  nota.textContent = texto;
  nota.style.display = texto ? '' : 'none';
}
function monthsBetween(anchorYM, targetYM){
  const [ay,am] = anchorYM.split('-').map(Number);
  const [ty,tm] = targetYM.split('-').map(Number);
  return (ty-ay)*12 + (tm-am);
}
// Descreve o tempo entre o início do contato e o mês de venda, pra dar uma noção
// rápida do ciclo de venda daquele cliente direto no formulário.
// Leads bem antigos podem ter "mes"/"mesInicioContato" guardados como "YYYY-MM" (de
// antes de existir o dia) — um <input type="date"> não consegue exibir isso e mostra
// vazio, mas a string ainda existe e conta como "preenchida" em qualquer checagem
// direta. Isso normaliza pro dia 1 daquele mês, deixando a exibição e os cálculos
// consistentes com o valor de verdade salvo.
function normalizarData(valor){
  if(!valor) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  if(/^\d{4}-\d{2}$/.test(valor)) return `${valor}-01`;
  return valor;
}
function textoCicloDeVenda(mesInicio, mesVenda){
  mesInicio = normalizarData(mesInicio);
  mesVenda = normalizarData(mesVenda);
  if(!mesInicio) return '';
  if(!mesVenda) return '🟡 Ciclo aberto — ainda não fechou.';
  const diferenca = monthsBetween(mesInicio, mesVenda);
  if(diferenca < 0) return '⚠️ A data de venda é anterior ao início do contato — confira as datas.';
  if(diferenca === 0) return '🔵 Ciclo de venda: fechou no mesmo mês do primeiro contato.';
  return `🔵 Ciclo de venda: ${diferenca} ${diferenca===1?'mês':'meses'} até fechar.`;
}
function addMonthsKey(ym, delta){
  const [y,m] = ym.split('-').map(Number);
  const d = new Date(y, m-1+delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
// Descobre o valor da parcela de índice "idx" (0 = primeira) dentro de um contrato,
// percorrendo os blocos da regra em ordem até achar em qual bloco esse índice cai.
// Contratos criados antes das regras editáveis não têm "blocos" detalhado — pra esses,
// cai no formato antigo de até 2 blocos (parcelas1/value + value2).
function parcelaValue(c, idx){
  if(Array.isArray(c.blocos) && c.blocos.length){
    let acumulado = 0;
    for(const b of c.blocos){
      if(idx < acumulado + b.parcelas) return b.value;
      acumulado += b.parcelas;
    }
    return c.blocos[c.blocos.length-1].value;
  }
  return idx < c.parcelas1 ? c.value : c.value2;
}
// A partir de qual índice de parcela o contrato foi cancelado (Infinity = nunca cancelado)
function contratoIdxCancelamento(c){
  if(!c.canceladoNoMes) return Infinity;
  const anchor = (c.date||'').slice(0,7);
  return monthsBetween(anchor, c.canceladoNoMes);
}
function parcelaAtivaNoMes(c, idx){
  return idx >= 0 && idx < c.parcelas && idx < contratoIdxCancelamento(c);
}
function contratoTotal(c){
  let total = 0;
  const limite = Math.min(c.parcelas, contratoIdxCancelamento(c));
  for(let i=0;i<limite;i++) total += parcelaValue(c,i);
  return total;
}
function contratoRestante(c, fromIdx){
  let total = 0;
  const limite = Math.min(c.parcelas, contratoIdxCancelamento(c));
  for(let i=Math.max(0,fromIdx);i<limite;i++) total += parcelaValue(c,i);
  return total;
}
function comissoesStats(){
  const rowsMes = contratos.map(c=>{
    const anchor = (c.date||'').slice(0,7);
    const idx = monthsBetween(anchor, comissoesMonth);
    return parcelaAtivaNoMes(c, idx) ? { c, idx, value: parcelaValue(c, idx) } : null;
  }).filter(Boolean);
  const previstoMes = rowsMes.reduce((a,r)=> a+r.value, 0);
  const totalAtivo = contratos.reduce((a,c)=>{
    const anchor = (c.date||'').slice(0,7);
    const idx = monthsBetween(anchor, comissoesMonth);
    return a + contratoRestante(c, idx);
  }, 0);
  return { previstoMes, totalAtivo, total: contratos.length };
}

/* ---------- derivações (Leads) ---------- */
// Ordenação compartilhada entre Leads, Pipeline e Comissões. "data-inicio" e
// "data-venda" usam os campos que representam cada uma dessas datas em cada tela —
// leads/pipeline têm as duas (mesInicioContato/mes), comissões só tem uma (date).
const OPCOES_ORDENACAO = [
  ['padrao', 'Ordem padrão'],
  ['alfabetica', 'Ordem alfabética'],
  ['recentes', 'Adicionados recentemente'],
  ['data-inicio', 'Data de início de contato'],
  ['data-venda', 'Data de venda'],
];
// Botão de funil que abre um menu com a ordenação atual marcada e as outras opções —
// usado em Leads, Pipeline e Comissões. "menuId" identifica qual dos três é esse (só
// um fica aberto por vez), "rotuloPadrao" troca o texto da primeira opção conforme
// o contexto (no Pipeline, por exemplo, deixa claro que o padrão é a ordem manual),
// e "ocultarInicio" tira a opção de início de contato pra Comissões, que não tem
// esse campo.
function renderBotaoOrdenar(menuId, valorAtual, rotuloPadrao, ocultarInicio){
  const aberto = ordenarMenuAberto === menuId;
  let opcoes = rotuloPadrao ? [[OPCOES_ORDENACAO[0][0], rotuloPadrao], ...OPCOES_ORDENACAO.slice(1)] : OPCOES_ORDENACAO;
  if(ocultarInicio) opcoes = opcoes.filter(([val])=> val !== 'data-inicio');
  return `
    <div class="ordenar-wrap">
      <button type="button" class="icon-btn ${valorAtual!=='padrao'?'ordenar-ativo':''}" data-action="toggle-ordenar-menu" data-menu-id="${menuId}" title="Ordenar">${ICON_FUNNEL}</button>
      ${aberto ? `
        <div class="date-menu ordenar-menu">
          <div class="date-menu-title">Ordenar por</div>
          <div class="date-menu-list">
            ${opcoes.map(([val,label])=>`<button class="date-menu-item ${valorAtual===val?'active':''}" data-action="escolher-ordenar" data-menu-id="${menuId}" data-valor="${val}">${label}</button>`).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}
function ordenarPorCriterio(lista, criterio, campoNome, campoInicio, campoVenda){
  if(criterio === 'alfabetica') return [...lista].sort((a,b)=> (a[campoNome]||'').localeCompare(b[campoNome]||'', 'pt-BR'));
  if(criterio === 'recentes') return [...lista].sort((a,b)=> new Date(b.createdAt||0) - new Date(a.createdAt||0));
  if(criterio === 'data-inicio') return [...lista].sort((a,b)=> String(a[campoInicio]||'').localeCompare(String(b[campoInicio]||'')));
  if(criterio === 'data-venda') return [...lista].sort((a,b)=> String(a[campoVenda]||'').localeCompare(String(b[campoVenda]||'')));
  return lista; // 'padrao' — não mexe na ordem
}
// Reordena de verdade (e salva) os cards de cada coluna do funil atual, conforme o
// critério escolhido. Como isso sobrescreve a ordem manual que a pessoa possa ter
// arrastado com cuidado, confirma antes — exceto ao voltar pra "padrao", que não
// mexe em nada, só para de aplicar ordenação automática daqui pra frente.
function aplicarOrdenacaoPipeline(criterio){
  if(criterio === 'padrao'){ pipelineOrdenarPor = 'padrao'; renderApp(); return; }
  showConfirm({
    message: 'Isso vai reordenar automaticamente os clientes dentro de cada coluna. Se você tiver organizado numa ordem específica que funciona melhor pra você, ela será substituída. Continuar?',
    confirmLabel: 'Reordenar',
    danger: false,
    onConfirm: async ()=>{
      closeConfirm();
      pipelineOrdenarPor = criterio;
      pipelineOrdenando = true;
      renderApp();
      const colunasDoFunil = board.columns.filter(c=>c.funilId===funilAtualId);
      try{
        for(const col of colunasDoFunil){
          const cardsDaColuna = cardsOf(col.id);
          const ordenados = ordenarPorCriterio(cardsDaColuna, criterio, 'cliente', 'mesInicioContato', 'mes');
          await Promise.all(ordenados.map((card, i)=>{
            const novaOrdem = (i+1)*1000;
            card.ordem = novaOrdem; // otimista
            return apiRequest('PUT', `/cards/${card.id}/move`, { columnId: col.id, ordem: novaOrdem });
          }));
        }
      }catch(e){
        errorMsg = 'Não foi possível reordenar todos os clientes. Tenta de novo em instantes.';
      }
      pipelineOrdenando = false;
      renderApp();
    },
  });
}
function filteredLeads(){
  let list = board.cards;
  list = list.filter(c=> mostrarArquivados ? c.arquivado : !c.arquivado);
  if(leadsStatusFilter) list = list.filter(c=>c.columnId===leadsStatusFilter);
  if(leadsSearch.trim()){
    const q = leadsSearch.trim().toLowerCase();
    list = list.filter(c=> (c.cliente||'').toLowerCase().includes(q) || (c.telefone||'').toLowerCase().includes(q));
  }
  list = ordenarPorCriterio(list, leadsOrdenarPor, 'cliente', 'mesInicioContato', 'mes');
  return list;
}

/* ---------- navegação entre páginas ---------- */
function goToPage(page){
  if(currentPage === page) return;
  // se o gestor estiver vendo o dashboard de outro membro e navegar pra qualquer
  // outra página (não só clicando em "Voltar"), restaura os próprios dados antes —
  // sem isso, ele acabaria vendo os leads/tarefas de outra pessoa numa tela como o
  // Pipeline, que permite editar de verdade
  if(visualizandoDashboardDe && page !== 'dashboard'){
    if(boardBackupGestor) board = boardBackupGestor;
    if(tasksBackupGestor) tasks = tasksBackupGestor;
    if(metaVendasValorBackupGestor !== null) metaVendasValor = metaVendasValorBackupGestor;
    boardBackupGestor = null;
    tasksBackupGestor = null;
    metaVendasValorBackupGestor = null;
    visualizandoDashboardDe = null;
  }
  if(currentPage === 'conversas') pararPollingConversa();
  currentPage = page;
  dateMenuOpen = false;
  openMenuColId = null;
  addingCol = false;
  editingColId = null;
  sidebarOpen = false;
  // fecha qualquer modal que tenha ficado aberto na página anterior — vários modais
  // diferentes (dia da agenda, editar lead, tarefa, contrato, proposta, etc.) usam o
  // mesmo #modal-root; sem isso, um modal esquecido aberto ficava por cima da nova
  // página, escondido mas ainda funcionando, respondendo a cliques que pareciam ser
  // da página nova.
  modalForm = null;
  extrasTela = null;
  agendaDiaSelecionado = null;
  taskModalForm = null;
  propostaModalForm = null;
  completarLeadModalForm = null;
  agendamentoModalForm = null;
  templateModalForm = null;
  eventoGoogleModalForm = null;
  contratoModalForm = null;
  regrasModalAberto = false;
  regraEditForm = null;
  automacaoModalForm = null;
  fluxoModalForm = null;
  modalAlterarNomeAberto = false;
  modalAlterarSenhaAberto = false;
  modalEditarPerfilAberto = false;
  avatarLightboxAberto = false;
  document.getElementById('modal-root').innerHTML = '';
  renderApp();
  if(page === 'tarefas'){
    if(!agendaLoaded) loadAgendaMes(agendaMesAtual); // só busca do zero — depois disso, a tela se mantém atualizada sozinha com as próprias ações, e o Google só é consultado de novo no botão "Sincronizar Agenda"
  }
  if(page === 'configuracoes'){
    senhaMsg = null; senhaAtualVal = ''; senhaNovaVal = '';
    nomeMsg = null; nomeNovoVal = (currentUser && currentUser.nome) || '';
    logoutAllMsg = null;
    avatarMsg = null;
    importResultado = null;
    twoFactorSetup = null; twoFactorMsg = null; mostrarDesativar2FA = false;
    auditoriaCarregada = false;
    loadAuditoria();
    refreshCurrentUser();
    loadIcsStatus();
  }
  if(page === 'equipe'){
    equipeMsg = null;
    if(equipe){
      if(equipeSubTab==='chat' && !chatLoaded) loadChat();
      if(equipeSubTab==='supervisao' && equipe.souSupervisor && !supervisaoLoaded) loadSupervisao();
      if(equipeSubTab==='monitoramento' && equipe.souSupervisorDeDados && !monitoramentoLoaded) loadMonitoramento();
    }
  }
  if(page === 'comissoes'){
    loadContratos(); // recarrega sempre, pra pegar comissões que o Pipeline gerou automaticamente
    if(!regrasComissaoLoaded) loadRegrasComissao();
  }
}
async function refreshCurrentUser(){
  try{
    const data = await apiRequest('GET', '/auth/me');
    currentUser = data.user;
    localStorage.setItem('user', JSON.stringify(currentUser));
    renderApp();
  }catch(e){ /* mantém os dados já em cache */ }
}

/* ---------- mutações: colunas e cards (cada uma fala com a API) ---------- */
// Anima os cards deslizando pra nova posição em vez de "pularem" — como a página é
// redesenhada por completo a cada ação (o jeito como o app inteiro funciona), o
// elemento antigo é destruído e um novo nasce direto na posição final. Pra dar a
// sensação de movimento mesmo assim, guardamos onde cada card estava ANTES de
// redesenhar; depois, no card novo (já na posição certa), aplicamos um deslocamento
// que o faz parecer que ainda está na posição antiga, e removemos esse deslocamento
// com uma transição suave — o efeito visual é de o card escorregando até o lugar novo.
function capturarPosicoes(seletor){
  const posicoes = new Map();
  document.querySelectorAll(seletor).forEach(el=>{
    posicoes.set(el.dataset.cardId || el.dataset.colId, el.getBoundingClientRect());
  });
  return posicoes;
}
function animarComFlip(seletor, posicoesAntigas, idParaExcluir){
  document.querySelectorAll(seletor).forEach(el=>{
    const chave = el.dataset.cardId || el.dataset.colId;
    if(idParaExcluir && chave===idParaExcluir) return; // esse aqui vai ganhar sua própria animação (fade), não o deslize
    const antiga = posicoesAntigas.get(chave);
    if(!antiga) return; // elemento novo (não existia antes) — nasce direto no lugar, sem animação
    const nova = el.getBoundingClientRect();
    const dx = antiga.left - nova.left;
    const dy = antiga.top - nova.top;
    if(Math.abs(dx) < 1 && Math.abs(dy) < 1) return; // não mudou de lugar de verdade
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(()=>{
      el.style.transition = 'transform .28s ease';
      el.style.transform = '';
      setTimeout(()=>{ el.style.transition = ''; }, 300); // devolve o controle pra transição normal do CSS (sombra, opacidade, margem)
    });
  });
}
function capturarPosicoesDosCards(){ return capturarPosicoes('.card[data-card-id]'); }
async function moveCard(cardId, columnId, ordem){
  const card = board.cards.find(c=>c.id===cardId);
  if(!card) return;
  if(card.columnId===columnId && ordem===undefined) return; // mesma coluna e sem posição nova pra aplicar — nada a fazer
  const anterior = { columnId: card.columnId, ordem: card.ordem };

  // guarda a posição vertical de origem, pra comparar com a de chegada depois do
  // redesenho e decidir a direção certa da animação (pra cima, pra baixo, ou parado)
  const elAntigo = document.querySelector(`.card[data-card-id="${cardId}"]`);
  const topAntigo = elAntigo ? elAntigo.getBoundingClientRect().top : null;
  if(elAntigo){
    elAntigo.classList.add('card-saindo'); // fade simples na saída — a direção certa só dá pra saber depois, na chegada
    await new Promise(resolve=> setTimeout(resolve, 150));
  }

  const posicoesAntigas = capturarPosicoesDosCards();
  card.columnId = columnId; // otimista
  if(ordem!==undefined) card.ordem = ordem;
  renderAppPreservandoScroll();
  animarComFlip('.card[data-card-id]', posicoesAntigas, cardId); // desliza os outros cards que abriram espaço; o card movido fica de fora, ganha a animação de chegada abaixo

  const elNovo = document.querySelector(`.card[data-card-id="${cardId}"]`);
  if(elNovo){
    const topNovo = elNovo.getBoundingClientRect().top;
    if(topAntigo==null || Math.abs(topNovo - topAntigo) < 6){
      elNovo.classList.add('card-chegando'); // não mudou de posição vertical de forma perceptível — só fade
    } else if(topNovo < topAntigo){
      elNovo.classList.add('card-chegando-cima'); // subiu — entra vindo de baixo pra cima
    } else {
      elNovo.classList.add('card-chegando-baixo'); // desceu — entra vindo de cima pra baixo
    }
  }

  try{
    const dados = { columnId };
    if(ordem!==undefined) dados.ordem = ordem;
    await apiRequest('PUT', `/cards/${cardId}/move`, dados);
  }catch(e){
    card.columnId = anterior.columnId;
    card.ordem = anterior.ordem;
    errorMsg = 'Não foi possível mover o cliente. Tente novamente.';
    renderAppPreservandoScroll();
  }
}
// Calcula em que posição um card deve entrar dentro de uma coluna, olhando pra qual
// altura (y) o dedo/mouse está — encontra os dois cards vizinhos naquele ponto e usa o
// valor do meio entre as ordens deles, sem precisar reajustar a ordem de mais ninguém.
// Usada tanto pra mostrar o indicador visual (durante o arrastar) quanto pra calcular
// a ordem de verdade (ao soltar) — as duas usam exatamente a mesma lógica, garantindo
// que o que aparece na tela bate com o que realmente vai acontecer ao soltar.
function encontrarIndiceDeInsercao(cardEls, y){
  let indiceInsercao = cardEls.length;
  for(let i=0;i<cardEls.length;i++){
    const rect = cardEls[i].getBoundingClientRect();
    if(y < rect.top + rect.height/2){ indiceInsercao = i; break; }
  }
  return indiceInsercao;
}
function calcularOrdemDeInsercao(colEl, y, cardIdSendoMovido){
  const cardEls = [...colEl.querySelectorAll('.card')].filter(el=> el.dataset.cardId !== cardIdSendoMovido);
  if(!cardEls.length) return 1000;
  // zera qualquer resto de transform/transição de uma animação de deslize anterior
  // que ainda possa estar em andamento — sem isso, a posição lida pode ser a de
  // um quadro intermediário da animação, não a posição final de descanso do card.
  cardEls.forEach(el=>{ el.style.transition = 'none'; el.style.transform = ''; });
  const indiceInsercao = encontrarIndiceDeInsercao(cardEls, y);
  const cardAntes = indiceInsercao > 0 ? board.cards.find(c=>c.id===cardEls[indiceInsercao-1].dataset.cardId) : null;
  const cardDepois = indiceInsercao < cardEls.length ? board.cards.find(c=>c.id===cardEls[indiceInsercao].dataset.cardId) : null;
  const ordemAntes = cardAntes ? (cardAntes.ordem||0) : null;
  const ordemDepois = cardDepois ? (cardDepois.ordem||0) : null;
  if(ordemAntes!=null && ordemDepois!=null) return (ordemAntes + ordemDepois) / 2;
  if(ordemAntes!=null) return ordemAntes + 1000;
  if(ordemDepois!=null) return ordemDepois - 1000;
  return 1000;
}
// Mostra visualmente onde o card vai encaixar — abre um espaço acima do card que ficaria
// logo depois dele (ou embaixo do último, se for pro final da lista), imitando o efeito
// de "os cards se abrem" pedido: um sobe, o espaço aparece, o card entra ali.
function mostrarIndicadorDeInsercao(colEl, y, cardIdSendoMovido){
  limparIndicadorDeInsercao();
  const cardEls = [...colEl.querySelectorAll('.card')].filter(el=> el.dataset.cardId !== cardIdSendoMovido);
  if(!cardEls.length) return;
  const indiceInsercao = encontrarIndiceDeInsercao(cardEls, y);
  if(indiceInsercao < cardEls.length) cardEls[indiceInsercao].classList.add('card-indicador-antes');
  else cardEls[cardEls.length-1].classList.add('card-indicador-depois');
}
function limparIndicadorDeInsercao(){
  document.querySelectorAll('.card-indicador-antes, .card-indicador-depois').forEach(el=>{
    el.classList.remove('card-indicador-antes', 'card-indicador-depois');
  });
}

async function deleteCardById(id){
  const idx = board.cards.findIndex(c=>c.id===id);
  if(idx===-1) return;
  const [removido] = board.cards.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/cards/${id}`);
  }catch(e){
    board.cards.splice(idx,0,removido);
    errorMsg = 'Não foi possível excluir o cliente.';
    renderApp();
  }
}

function toggleSelecaoLead(id){
  if(leadsSelecionados.has(id)) leadsSelecionados.delete(id);
  else leadsSelecionados.add(id);
  renderApp();
}
function toggleSelecionarTodosLeads(idsVisiveis){
  const todosJaSelecionados = idsVisiveis.length>0 && idsVisiveis.every(id=>leadsSelecionados.has(id));
  if(todosJaSelecionados) idsVisiveis.forEach(id=>leadsSelecionados.delete(id));
  else idsVisiveis.forEach(id=>leadsSelecionados.add(id));
  renderApp();
}
async function bulkMoverLeads(columnId){
  if(!columnId || !leadsSelecionados.size) return;
  const ids = [...leadsSelecionados];
  leadsSelecionados.clear();
  renderApp();
  await Promise.all(ids.map(id=> moveCard(id, columnId)));
}
async function bulkArquivarLeads(){
  const ids = [...leadsSelecionados];
  leadsSelecionados.clear();
  renderApp();
  await Promise.all(ids.map(async (id)=>{
    try{
      const atualizado = await apiRequest('PUT', `/cards/${id}/arquivar`);
      const idx = board.cards.findIndex(c=>c.id===id);
      if(idx>-1) board.cards[idx] = atualizado;
    }catch(e){ /* segue tentando os outros mesmo se um falhar */ }
  }));
  renderApp();
}
async function bulkExcluirLeads(){
  const ids = [...leadsSelecionados];
  leadsSelecionados.clear();
  for(const id of ids) await deleteCardById(id);
}
function confirmarBulkEtiqueta(){
  const valor = leadsBulkEtiquetaValor;
  leadsBulkEtiquetaAberta = false;
  leadsBulkEtiquetaValor = '';
  bulkEtiquetaLeads(valor);
}
async function bulkEtiquetaLeads(etiqueta){
  if(!etiqueta.trim()) return;
  const ids = [...leadsSelecionados];
  leadsSelecionados.clear();
  renderApp();
  await Promise.all(ids.map(async (id)=>{
    const card = board.cards.find(c=>c.id===id);
    if(!card) return;
    const etiquetasAtuais = card.etiquetas || [];
    if(etiquetasAtuais.includes(etiqueta.trim())) return;
    const novasEtiquetas = [...etiquetasAtuais, etiqueta.trim()];
    try{
      await apiRequest('PUT', `/cards/${id}`, { etiquetas: novasEtiquetas });
      card.etiquetas = novasEtiquetas;
    }catch(e){ /* segue tentando os outros mesmo se um falhar */ }
  }));
  renderApp();
}

async function renameColumn(id, nome){
  const col = board.columns.find(c=>c.id===id);
  if(!col) return;
  const nomeFinal = nome.trim() || col.nome;
  const anterior = col.nome;
  col.nome = nomeFinal;
  renderApp();
  try{
    await apiRequest('PUT', `/columns/${id}`, { nome: nomeFinal });
  }catch(e){
    col.nome = anterior;
    errorMsg = 'Não foi possível renomear a coluna.';
    renderApp();
  }
}

async function changeTipo(id, tipo){
  const col = board.columns.find(c=>c.id===id);
  if(!col) return;
  const anterior = col.tipo;
  col.tipo = tipo;
  openMenuColId = null;
  renderApp();
  try{
    await apiRequest('PUT', `/columns/${id}`, { tipo });
  }catch(e){
    col.tipo = anterior;
    errorMsg = 'Não foi possível alterar o tipo da coluna.';
    renderApp();
  }
}
async function salvarProbabilidadeColuna(id, valor){
  const col = board.columns.find(c=>c.id===id);
  if(!col) return;
  const nova = Math.max(0, Math.min(100, parseInt(valor,10) || 0));
  const anterior = col.probabilidade;
  if(nova === anterior) return;
  col.probabilidade = nova;
  renderApp();
  try{
    await apiRequest('PUT', `/columns/${id}`, { probabilidade: nova });
  }catch(e){
    col.probabilidade = anterior;
    errorMsg = 'Não foi possível salvar a probabilidade.';
    renderApp();
  }
}

async function deleteColumnById(id){
  const colIdx = board.columns.findIndex(c=>c.id===id);
  if(colIdx===-1) return;
  const [colRemovida] = board.columns.splice(colIdx,1);
  const cardsRemovidos = board.cards.filter(c=>c.columnId===id);
  board.cards = board.cards.filter(c=>c.columnId!==id);
  openMenuColId = null;
  renderApp();
  try{
    await apiRequest('DELETE', `/columns/${id}`);
  }catch(e){
    board.columns.splice(colIdx,0,colRemovida);
    board.cards.push(...cardsRemovidos);
    errorMsg = 'Não foi possível excluir a coluna.';
    renderApp();
  }
}

async function reorderColumns(draggedId, targetId){
  if(draggedId === targetId) return;
  const doFunil = board.columns.filter(c=>c.funilId===funilAtualId);
  const outras = board.columns.filter(c=>c.funilId!==funilAtualId);
  const fromIdx = doFunil.findIndex(c=>c.id===draggedId);
  const toIdx = doFunil.findIndex(c=>c.id===targetId);
  if(fromIdx===-1 || toIdx===-1) return;
  const anterior = [...board.columns];
  const posicoesAntigas = capturarPosicoes('.column[data-col-id]');
  const [movida] = doFunil.splice(fromIdx,1);
  doFunil.splice(toIdx,0,movida);
  board.columns = [...outras, ...doFunil];
  renderApp();
  animarComFlip('.column[data-col-id]', posicoesAntigas);
  try{
    await Promise.all(doFunil.map((col,idx)=> apiRequest('PUT', `/columns/${col.id}`, { ordem: idx })));
  }catch(e){
    board.columns = anterior;
    errorMsg = 'Não foi possível reordenar as colunas.';
    renderApp();
  }
}

async function addColumn(){
  const nome = newColNameVal.trim();
  const tipoEl = document.getElementById('new-col-tipo');
  const tipo = tipoEl ? tipoEl.value : 'aberto';
  addingCol = false;
  newColNameVal = '';
  newColTipoVal = 'aberto';
  if(!nome || !funilAtualId){ renderApp(); return; }
  try{
    const novaCol = await apiRequest('POST', '/columns', { nome, tipo, funilId: funilAtualId });
    board.columns.push(novaCol);
    renderApp();
    abrirPickerLeadsParaColuna(novaCol.id);
    return;
  }catch(e){
    errorMsg = 'Não foi possível criar a coluna.';
  }
  renderApp();
}

async function saveCardFromModal(){
  if(salvandoCard) return; // já tem um salvamento em andamento — ignora cliques repetidos
  const nomeFinal = (modalForm.tipoPessoa==='juridica' ? modalForm.clienteJuridica : modalForm.clienteFisica) || '';
  if(!nomeFinal.trim()) return;
  const eraNovo = modalForm.__isNew;
  const { __isNew, id, clienteFisica, clienteJuridica, ...dados } = modalForm;
  dados.cliente = nomeFinal.trim();
  salvandoCard = true;
  renderModal();
  try{
    if(__isNew){
      const novoCard = await apiRequest('POST', '/cards', dados);
      board.cards.push(novoCard);
    } else {
      const atualizado = await apiRequest('PUT', `/cards/${id}`, dados);
      const idx = board.cards.findIndex(c=>c.id===id);
      if(idx>-1) board.cards[idx] = atualizado;
    }
    salvandoCard = false;
    if(eraNovo){
      // mostra "Novo lead adicionado" por cima do botão (fade in, sobe um pouco, fade
      // out) antes de fechar — assim a pessoa vê claramente que salvou, em vez de só
      // sumir a tela de repente sem confirmação nenhuma.
      mensagemSalvoCard = 'Novo lead adicionado';
      renderModal();
      await new Promise(resolve=> setTimeout(resolve, 1300));
      mensagemSalvoCard = null;
    }
    closeModal();
    renderApp();
  }catch(e){
    salvandoCard = false;
    errorMsg = 'Não foi possível salvar o cliente.';
    renderModal();
    renderApp();
  }
}

/* ---------- mutações: tarefas ---------- */
async function saveTaskFromModal(){
  if(salvandoTask) return; // já tem um salvamento em andamento — ignora cliques repetidos
  if(!taskModalForm.titulo.trim()) return;
  const { __isNew, id, hora, ...dados } = taskModalForm;
  if(!dados.leadId) dados.leadId = null;
  if(dados.vencimento && hora){
    const combinado = new Date(`${dados.vencimento}T${hora}`);
    if(!isNaN(combinado.getTime())) dados.vencimento = combinado.toISOString();
  }
  salvandoTask = true;
  renderTaskModal();
  try{
    if(__isNew){
      const nova = await apiRequest('POST', '/tasks', dados);
      tasks.push(nova);
      atualizarTarefaNaAgendaLocal(nova);
    } else {
      const atualizada = await apiRequest('PUT', `/tasks/${id}`, dados);
      const idx = tasks.findIndex(t=>t.id===id);
      if(idx>-1) tasks[idx] = atualizada;
      atualizarTarefaNaAgendaLocal(atualizada);
    }
    salvandoTask = false;
    closeTaskModal();
  }catch(e){
    salvandoTask = false;
    errorMsg = 'Não foi possível salvar a tarefa.';
    renderTaskModal();
  }
  renderApp();
}

async function deleteTaskById(id){
  const idx = tasks.findIndex(t=>t.id===id);
  if(idx===-1) return;
  const [removida] = tasks.splice(idx,1);
  removerTarefaDaAgendaLocal(id);
  renderApp();
  try{
    await apiRequest('DELETE', `/tasks/${id}`);
  }catch(e){
    tasks.splice(idx,0,removida);
    atualizarTarefaNaAgendaLocal(removida);
    errorMsg = 'Não foi possível excluir a tarefa.';
    renderApp();
  }
}

async function toggleTaskConcluida(id){
  const task = tasks.find(t=>t.id===id);
  const taskAgenda = agendaTarefas.find(t=>t.id===id);
  if(!task && !taskAgenda) return;
  if(task) task.concluida = !task.concluida; // otimista
  if(taskAgenda) taskAgenda.concluida = task ? task.concluida : !taskAgenda.concluida;
  renderApp();
  try{
    const atualizada = await apiRequest('PUT', `/tasks/${id}/toggle`);
    const idx = tasks.findIndex(t=>t.id===id);
    if(idx>-1) tasks[idx] = atualizada;
    if(taskAgenda) taskAgenda.concluida = atualizada.concluida;
  }catch(e){
    if(task) task.concluida = !task.concluida;
    if(taskAgenda) taskAgenda.concluida = !taskAgenda.concluida;
    errorMsg = 'Não foi possível atualizar a tarefa.';
    renderApp();
  }
}
async function toggleEventoConcluido(id){
  const evento = agendaEventosGoogle.find(e=>e.id===id);
  if(!evento) return;
  evento.concluida = !evento.concluida; // otimista
  renderApp();
  try{
    const atualizado = await apiRequest('PUT', `/calendar/eventos/${id}/toggle`);
    evento.concluida = atualizado.concluida;
  }catch(e){
    evento.concluida = !evento.concluida;
    errorMsg = 'Não foi possível atualizar o evento.';
  }
  renderApp();
}

/* ---------- mutações: comissões ---------- */
async function saveContratoFromModal(){
  const f = contratoModalForm;
  if(!f.desc.trim() || !f.creditoValor) return;
  const dados = { desc: f.desc, scope: f.scope, date: f.date, creditoValor: f.creditoValor, tipoCarta: f.tipoCarta };
  try{
    if(f.__isNew){
      const novo = await apiRequest('POST', '/comissoes', dados);
      contratos.unshift(novo);
    } else {
      const atualizado = await apiRequest('PUT', `/comissoes/${f.id}`, dados);
      const idx = contratos.findIndex(c=>c.id===f.id);
      if(idx>-1) contratos[idx] = atualizado;
    }
    closeContratoModal();
  }catch(e){
    errorMsg = 'Não foi possível salvar o contrato.';
  }
  renderApp();
}
async function deleteContratoById(id){
  const idx = contratos.findIndex(c=>c.id===id);
  if(idx===-1) return;
  const [removido] = contratos.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/comissoes/${id}`);
  }catch(e){
    contratos.splice(idx,0,removido);
    errorMsg = 'Não foi possível excluir o contrato.';
    renderApp();
  }
}
async function cancelarContrato(id){
  const c = contratos.find(x=>x.id===id);
  if(!c) return;
  const anterior = c.canceladoNoMes;
  c.canceladoNoMes = comissoesMonth; // usa o mês que está sendo visto na página como referência
  renderApp();
  try{
    const atualizado = await apiRequest('PUT', `/comissoes/${id}`, { canceladoNoMes: comissoesMonth });
    const idx = contratos.findIndex(x=>x.id===id);
    if(idx>-1) contratos[idx] = atualizado;
  }catch(e){
    c.canceladoNoMes = anterior;
    errorMsg = 'Não foi possível cancelar o contrato.';
  }
  renderApp();
}
async function reativarContrato(id){
  const c = contratos.find(x=>x.id===id);
  if(!c) return;
  const anterior = c.canceladoNoMes;
  c.canceladoNoMes = null;
  renderApp();
  try{
    const atualizado = await apiRequest('PUT', `/comissoes/${id}`, { canceladoNoMes: null });
    const idx = contratos.findIndex(x=>x.id===id);
    if(idx>-1) contratos[idx] = atualizado;
  }catch(e){
    c.canceladoNoMes = anterior;
    errorMsg = 'Não foi possível reativar o contrato.';
  }
  renderApp();
}

/* ---------- 2FA (verificação em duas etapas) ---------- */
function renderSecao2FA(){
  if(twoFactorSetup){
    return `
      <p class="settings-page-note">Escaneie o QR code com seu app autenticador (Google Authenticator, Authy, etc.) e digite o código gerado pra confirmar.</p>
      <div id="qrcode-2fa" style="margin:12px 0;"></div>
      <p class="settings-page-note">Ou digite manualmente: <code>${esc(twoFactorSetup.segredo)}</code></p>
      <div class="field">
        <label>Código de 6 dígitos</label>
        <input type="text" id="twofa-confirmar-codigo" maxlength="6" inputmode="numeric" placeholder="000000" />
      </div>
      ${twoFactorMsg ? `<p class="settings-page-msg ${twoFactorMsg.tipo}">${esc(twoFactorMsg.texto)}</p>` : ''}
      <div class="settings-btn-row">
        <button class="btn-outline" id="twofa-cancelar-setup">Cancelar</button>
        <button class="btn-primary" id="twofa-confirmar" ${twoFactorSalvando?'disabled':''}>${twoFactorSalvando?'Confirmando…':'Confirmar e ativar'}</button>
      </div>
    `;
  }
  if(currentUser && currentUser.twoFactorEnabled){
    return `
      <p class="settings-page-note">✓ Ativada — um código do seu app autenticador é pedido a cada login.</p>
      ${!mostrarDesativar2FA ? `
        <button class="btn-danger" id="twofa-mostrar-desativar">Desativar</button>
      ` : `
        <div class="field">
          <label>Digite o código atual pra confirmar</label>
          <input type="text" id="twofa-desativar-codigo" maxlength="6" inputmode="numeric" placeholder="000000" />
        </div>
        ${twoFactorMsg ? `<p class="settings-page-msg ${twoFactorMsg.tipo}">${esc(twoFactorMsg.texto)}</p>` : ''}
        <div class="settings-btn-row">
          <button class="btn-outline" id="twofa-cancelar-desativar">Cancelar</button>
          <button class="btn-danger" id="twofa-confirmar-desativar" ${twoFactorSalvando?'disabled':''}>${twoFactorSalvando?'Desativando…':'Confirmar desativação'}</button>
        </div>
      `}
    `;
  }
  return `
    <p class="settings-page-note">Desativada — adicione uma camada extra de segurança exigindo um código do celular a cada login.</p>
    <button class="btn-outline" id="twofa-iniciar">Ativar</button>
  `;
}
function renderizarQrCode2FA(){
  const el = document.getElementById('qrcode-2fa');
  if(el && twoFactorSetup && window.QRCode){
    el.innerHTML = '';
    new QRCode(el, { text: twoFactorSetup.otpauthUri, width:180, height:180 });
  }
}
async function iniciar2FA(){
  twoFactorMsg = null;
  try{
    const data = await apiRequest('POST', '/auth/2fa/iniciar');
    twoFactorSetup = { segredo: data.segredo, otpauthUri: data.otpauthUri };
  }catch(e){
    errorMsg = e.message || 'Não foi possível iniciar a configuração do 2FA.';
  }
  renderApp();
  renderizarQrCode2FA();
}
function cancelarSetup2FA(){
  twoFactorSetup = null;
  twoFactorMsg = null;
  renderApp();
}
async function confirmar2FA(){
  const input = document.getElementById('twofa-confirmar-codigo');
  const codigo = input ? input.value.trim() : '';
  twoFactorSalvando = true;
  twoFactorMsg = null;
  renderApp();
  try{
    await apiRequest('POST', '/auth/2fa/confirmar', { codigo });
    await refreshCurrentUser();
    twoFactorSetup = null;
    twoFactorMsg = null;
  }catch(e){
    twoFactorMsg = { tipo:'erro', texto: e.message || 'Código incorreto.' };
  }
  twoFactorSalvando = false;
  renderApp();
  renderizarQrCode2FA();
}
async function desativar2FA(){
  const input = document.getElementById('twofa-desativar-codigo');
  const codigo = input ? input.value.trim() : '';
  twoFactorSalvando = true;
  twoFactorMsg = null;
  renderApp();
  try{
    await apiRequest('POST', '/auth/2fa/desativar', { codigo });
    await refreshCurrentUser();
    mostrarDesativar2FA = false;
    twoFactorMsg = null;
  }catch(e){
    twoFactorMsg = { tipo:'erro', texto: e.message || 'Código incorreto.' };
  }
  twoFactorSalvando = false;
  renderApp();
}
async function loadAuditoria(){
  try{
    const data = await apiRequest('GET', '/auditoria');
    auditoriaEventos = data.eventos || [];
  }catch(e){
    auditoriaEventos = [];
  }
  auditoriaCarregada = true;
  renderApp();
}

/* ---------- mutações: senha e importação de leads ---------- */
async function salvarNome(){
  const nome = nomeNovoVal.trim();
  if(!nome){
    nomeMsg = { tipo:'erro', texto:'Digite um nome.' };
    renderApp();
    if(modalAlterarNomeAberto) renderAlterarNomeModal();
    return;
  }
  nomeSalvando = true;
  nomeMsg = null;
  renderApp();
  if(modalAlterarNomeAberto) renderAlterarNomeModal();
  try{
    await apiRequest('PUT', '/auth/nome', { nome });
    nomeMsg = { tipo:'ok', texto:'Nome atualizado.' };
    await refreshCurrentUser();
  }catch(e){
    nomeMsg = { tipo:'erro', texto: e.message || 'Não foi possível atualizar o nome.' };
  }
  nomeSalvando = false;
  renderApp();
  if(modalAlterarNomeAberto) renderAlterarNomeModal();
}
/* ---------- busca global (Ctrl+K) ---------- */
function abrirBuscaGlobal(){
  buscaGlobalAberta = true;
  buscaGlobalTexto = '';
  renderBuscaGlobalModal();
  setTimeout(()=>{ const el = document.getElementById('busca-global-input'); if(el) el.focus(); }, 0);
}
function closeBuscaGlobal(){
  buscaGlobalAberta = false;
  document.getElementById('modal-root').innerHTML = '';
}
function renderBuscaGlobalModal(){
  const root = document.getElementById('modal-root');
  if(!buscaGlobalAberta){ root.innerHTML=''; return; }
  const termo = buscaGlobalTexto.trim().toLowerCase();
  let leadsResultado = [];
  let tarefasResultado = [];
  if(termo){
    leadsResultado = board.cards.filter(c=>
      (c.cliente||'').toLowerCase().includes(termo) || (c.telefone||'').includes(termo)
    ).slice(0,8);
    tarefasResultado = tasks.filter(t=> (t.titulo||'').toLowerCase().includes(termo)).slice(0,8);
  }
  root.innerHTML = `
    <div class="overlay" id="busca-global-overlay">
      <div class="modal modal-lg busca-global-modal">
        <div class="busca-global-input-row">
          ${ICON_BUSCA}
          <input type="text" id="busca-global-input" placeholder="Buscar cliente ou tarefa..." value="${esc(buscaGlobalTexto)}" />
          <button id="busca-global-close" title="Fechar (Esc)">✕</button>
        </div>
        <div class="busca-global-resultados">
          ${!termo ? `<p class="settings-page-note" style="padding:16px;">Digite pra buscar clientes e tarefas. Atalho: Ctrl+K (ou ⌘K no Mac).</p>` : `
            ${leadsResultado.length ? `
              <div class="busca-global-grupo-titulo">Clientes</div>
              ${leadsResultado.map(c=>`
                <button type="button" class="busca-global-item" data-action="busca-global-abrir-lead" data-card-id="${c.id}">
                  <span class="busca-global-item-nome">${esc(c.cliente)||'Sem nome'}</span>
                  <span class="settings-page-note">${esc(c.telefone||'')}</span>
                </button>
              `).join('')}
            ` : ''}
            ${tarefasResultado.length ? `
              <div class="busca-global-grupo-titulo">Tarefas</div>
              ${tarefasResultado.map(t=>`
                <button type="button" class="busca-global-item" data-action="busca-global-abrir-tarefa" data-task-id="${t.id}">
                  <span class="busca-global-item-nome">${esc(t.titulo)}</span>
                  ${t.vencimento ? `<span class="settings-page-note">${formatDate(t.vencimento)}</span>` : ''}
                </button>
              `).join('')}
            ` : ''}
            ${!leadsResultado.length && !tarefasResultado.length ? `<p class="settings-page-note" style="padding:16px;">Nada encontrado.</p>` : ''}
          `}
        </div>
      </div>
    </div>
  `;
  document.getElementById('busca-global-close').addEventListener('click', closeBuscaGlobal);
  document.getElementById('busca-global-overlay').addEventListener('click', (e)=>{ if(e.target.id==='busca-global-overlay') closeBuscaGlobal(); });
  const inputEl = document.getElementById('busca-global-input');
  inputEl.addEventListener('input', (e)=>{
    buscaGlobalTexto = e.target.value;
    renderBuscaGlobalModal();
    const novo = document.getElementById('busca-global-input');
    if(novo){ novo.focus(); novo.setSelectionRange(novo.value.length, novo.value.length); }
  });
  inputEl.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeBuscaGlobal(); });
  document.querySelectorAll('[data-action="busca-global-abrir-lead"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ closeBuscaGlobal(); openEditCard(btn.dataset.cardId); });
  });
  document.querySelectorAll('[data-action="busca-global-abrir-tarefa"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ closeBuscaGlobal(); goToPage('tarefas'); });
  });
}
document.addEventListener('keydown', (e)=>{
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k'){
    e.preventDefault();
    if(getToken() && !buscaGlobalAberta) abrirBuscaGlobal();
  }
});

function iniciaisDoNome(nome){
  const partes = (nome||'').trim().split(/\s+/).filter(Boolean);
  if(!partes.length) return '?';
  if(partes.length === 1) return partes[0][0].toUpperCase();
  return (partes[0][0] + partes[partes.length-1][0]).toUpperCase();
}
function redimensionarImagem(file, tamanho){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        const canvas = document.createElement('canvas');
        canvas.width = tamanho;
        canvas.height = tamanho;
        const ctx = canvas.getContext('2d');
        const lado = Math.min(img.width, img.height);
        const sx = (img.width - lado)/2;
        const sy = (img.height - lado)/2;
        ctx.drawImage(img, sx, sy, lado, lado, 0, 0, tamanho, tamanho);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = ()=> reject(new Error('Não foi possível ler a imagem.'));
      img.src = e.target.result;
    };
    reader.onerror = ()=> reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}
async function handleAvatarFileSelected(file){
  if(!file) return;
  avatarMsg = null;
  try{
    const dataUrl = await redimensionarImagem(file, 128);
    avatarSalvando = true;
    renderApp();
    await apiRequest('PUT', '/auth/avatar', { avatarUrl: dataUrl });
    await refreshCurrentUser();
    avatarMsg = { tipo:'ok', texto:'Foto atualizada.' };
  }catch(e){
    avatarMsg = { tipo:'erro', texto: e.message || 'Não foi possível enviar a foto.' };
  }
  avatarSalvando = false;
  renderApp();
}
async function removerAvatar(){
  avatarSalvando = true;
  avatarMsg = null;
  renderApp();
  try{
    await apiRequest('PUT', '/auth/avatar', { avatarUrl: null });
    await refreshCurrentUser();
    avatarMsg = { tipo:'ok', texto:'Foto removida.' };
  }catch(e){
    avatarMsg = { tipo:'erro', texto: e.message || 'Não foi possível remover a foto.' };
  }
  avatarSalvando = false;
  renderApp();
}
async function desconectarTodosDispositivos(){
  logoutAllEnviando = true;
  logoutAllMsg = null;
  renderApp();
  try{
    await apiRequest('POST', '/auth/logout-all');
    logout(); // esse dispositivo também precisa entrar de novo
  }catch(e){
    logoutAllMsg = { tipo:'erro', texto: e.message || 'Não foi possível desconectar os dispositivos.' };
    logoutAllEnviando = false;
    renderApp();
  }
}
async function salvarSenha(){
  if(!senhaNovaVal || senhaNovaVal.length < 6){
    senhaMsg = { tipo:'erro', texto:'A nova senha precisa ter ao menos 6 caracteres.' };
    renderApp();
    if(modalAlterarSenhaAberto) renderAlterarSenhaModal();
    return;
  }
  senhaSalvando = true;
  senhaMsg = null;
  renderApp();
  if(modalAlterarSenhaAberto) renderAlterarSenhaModal();
  try{
    await apiRequest('PUT', '/auth/password', { senhaAtual: senhaAtualVal, senhaNova: senhaNovaVal });
    senhaMsg = { tipo:'ok', texto:'Senha salva com sucesso.' };
    senhaAtualVal = ''; senhaNovaVal = '';
    await refreshCurrentUser();
  }catch(e){
    senhaMsg = { tipo:'erro', texto: e.message || 'Não foi possível salvar a senha.' };
  }
  senhaSalvando = false;
  renderApp();
  if(modalAlterarSenhaAberto) renderAlterarSenhaModal();
}

// Parser simples de CSV: "Nome,Telefone,Valor", uma linha por lead.
// Não lida com campos entre aspas contendo vírgulas — suficiente pro uso esperado.
function parseCsvLeads(texto){
  const linhas = texto.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(!linhas.length) return [];
  const inicio = /nome/i.test(linhas[0]) ? 1 : 0;
  const out = [];
  for(let i=inicio;i<linhas.length;i++){
    const partes = linhas[i].split(',').map(p=>p.trim().replace(/^"|"$/g,''));
    if(!partes[0]) continue;
    const valorTexto = (partes[2]||'0').replace(/[^\d,.-]/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.');
    out.push({ nome: partes[0], telefone: partes[1]||'', valor: parseFloat(valorTexto) || 0 });
  }
  return out;
}
async function importarLeadsCsv(){
  const fileInput = document.getElementById('import-arquivo');
  const file = fileInput && fileInput.files && fileInput.files[0];
  if(!file){ errorMsg = 'Escolha um arquivo CSV primeiro.'; renderApp(); return; }
  const columnId = importColumnId || (document.getElementById('import-coluna') || {}).value;
  if(!columnId){ errorMsg = 'Escolha a coluna de destino.'; renderApp(); return; }

  importando = true;
  importResultado = null;
  renderApp();

  const texto = await file.text();
  const linhas = parseCsvLeads(texto);
  let sucesso = 0, falha = 0;
  for(const linha of linhas){
    try{
      const novo = await apiRequest('POST', '/cards', {
        columnId, cliente: linha.nome, telefone: linha.telefone, valor: linha.valor,
        temperatura: 'morno', obs: '', mes: currentMonthKey(),
      });
      board.cards.push(novo);
      sucesso++;
    }catch(e){ falha++; }
  }
  importResultado = { sucesso, falha };
  importando = false;
  renderApp();
}

/* ---------- IA ---------- */
async function gerarInsightsIA(){
  insightsCarregando = true;
  renderApp();
  try{
    const data = await apiRequest('POST', '/ai/insights', { funilId: funilAtualId });
    aiInsights = data.insights || [];
  }catch(e){
    errorMsg = e.message || 'Não foi possível gerar os insights.';
  }
  insightsCarregando = false;
  renderApp();
}

async function sugerirMensagemIA(){
  if(!modalForm || modalForm.__isNew) return;
  const btn = document.getElementById('f-ai-mensagem');
  const resultBox = document.getElementById('f-ai-mensagem-result');
  if(btn){ btn.disabled = true; btn.innerHTML = `${ICON_SPARKLE} Gerando…`; }
  try{
    const data = await apiRequest('POST', '/ai/mensagem', { cardId: modalForm.id });
    if(resultBox){
      resultBox.style.display = 'block';
      resultBox.innerHTML = `
        <p>${esc(data.mensagem)}</p>
        <div class="ai-result-actions">
          <button type="button" class="btn-outline" id="f-ai-copiar">Copiar</button>
          <button type="button" class="wa-btn" id="f-ai-abrir-wa">${WA_ICON} Abrir com essa mensagem</button>
        </div>
      `;
      const copiarBtn = document.getElementById('f-ai-copiar');
      if(copiarBtn) copiarBtn.addEventListener('click', ()=>{
        navigator.clipboard.writeText(data.mensagem).catch(()=>{});
      });
      const abrirBtn = document.getElementById('f-ai-abrir-wa');
      if(abrirBtn) abrirBtn.addEventListener('click', ()=>{
        const link = waLink(modalForm.telefone);
        if(link) window.open(link + '?text=' + encodeURIComponent(data.mensagem), '_blank', 'noopener');
      });
    }
  }catch(e){
    errorMsg = e.message || 'Não foi possível gerar a mensagem.';
    renderApp();
  }
  if(btn){ btn.disabled = false; btn.innerHTML = `${ICON_SPARKLE} Sugerir mensagem`; }
}

async function sugerirTarefaIA(){
  if(!modalForm || modalForm.__isNew) return;
  const btn = document.getElementById('f-ai-tarefa');
  const resultBox = document.getElementById('f-ai-tarefa-result');
  if(btn){ btn.disabled = true; btn.innerHTML = `${ICON_SPARKLE} Pensando…`; }
  try{
    const data = await apiRequest('POST', '/ai/sugerir-tarefa', { cardId: modalForm.id });
    const dataVenc = new Date();
    dataVenc.setDate(dataVenc.getDate() + data.dias);
    const vencISO = dataVenc.toISOString().slice(0,10);
    if(resultBox){
      resultBox.style.display = 'block';
      resultBox.innerHTML = `
        <p><b>${esc(data.titulo)}</b> — vencimento sugerido: ${formatDate(vencISO)}</p>
        <div class="ai-result-actions">
          <button type="button" class="btn-outline" id="f-ai-criar-tarefa">Criar essa tarefa</button>
        </div>
      `;
      const criarBtn = document.getElementById('f-ai-criar-tarefa');
      if(criarBtn) criarBtn.addEventListener('click', async ()=>{
        criarBtn.disabled = true;
        try{
          const nova = await apiRequest('POST', '/tasks', {
            titulo: data.titulo, vencimento: vencISO, prioridade:'media', leadId: modalForm.id, descricao:'',
          });
          tasks.push(nova);
          resultBox.innerHTML = '<p>✓ Tarefa criada.</p>';
        }catch(e){
          errorMsg = 'Não foi possível criar a tarefa.';
          renderApp();
        }
      });
    }
  }catch(e){
    errorMsg = e.message || 'Não foi possível sugerir uma tarefa.';
    renderApp();
  }
  if(btn){ btn.disabled = false; btn.innerHTML = `${ICON_SPARKLE} Sugerir tarefa de acompanhamento`; }
}

/* ---------- render: shell (barra lateral + página atual) ---------- */
// Redesenha a página igual renderApp(), mas guarda e restaura a posição de rolagem
// antes/depois — usado em ações do Pipeline (mover card) que não deveriam "resetar"
// a visão de quem já rolou a tela pra ver um cliente lá embaixo.
function renderAppPreservandoScroll(){
  const mainEl = document.querySelector('main.pipeline-main');
  const scrollHorizontal = mainEl ? mainEl.scrollLeft : null;
  const scrollsColunas = {};
  document.querySelectorAll('.cards[data-col-id]').forEach(el=>{
    scrollsColunas[el.dataset.colId] = el.scrollTop;
  });

  renderApp();

  const mainEl2 = document.querySelector('main.pipeline-main');
  if(mainEl2 && scrollHorizontal!==null) mainEl2.scrollLeft = scrollHorizontal;
  document.querySelectorAll('.cards[data-col-id]').forEach(el=>{
    if(scrollsColunas[el.dataset.colId]!==undefined) el.scrollTop = scrollsColunas[el.dataset.colId];
  });
}
/* ---------- Assistente flutuante (bolinha de ajuda) ---------- */
function renderAssistente(){
  const root = document.getElementById('assistente-root');
  if(!root) return;
  if(!getToken()){ root.innerHTML=''; return; } // só aparece logado
  if(!integracoesConfig.assistenteIA){ root.innerHTML=''; return; } // servidor sem ANTHROPIC_API_KEY configurada

  const posBolha = assistenteBolhaX!=null ? `left:${assistenteBolhaX}px; top:${assistenteBolhaY}px; right:auto; bottom:auto;` : '';

  root.innerHTML = `
    <button id="assistente-bolha" class="assistente-bolha" style="${posBolha}" title="Assistente do CRM">${assistenteAberto ? '✕' : '💬'}</button>
    ${assistenteAberto ? `
      <div class="assistente-painel" id="assistente-painel">
        <div class="assistente-painel-head">
          <span>✨ Assistente do CRM</span>
          <button id="assistente-fechar" title="Fechar">✕</button>
        </div>
        <div class="assistente-mensagens" id="assistente-mensagens-lista">
          ${!assistenteMensagens.length ? `<div class="assistente-msg assistente-msg-assistant">Oi! Pode perguntar qualquer coisa sobre como usar o CRM — Pipeline, Agenda, GEROT, Comissões, Fluxos, o que precisar.</div>` : ''}
          ${assistenteMensagens.map(m=>`<div class="assistente-msg assistente-msg-${m.role}">${esc(m.content)}</div>`).join('')}
          ${assistenteEnviando ? `<div class="assistente-msg assistente-msg-assistant assistente-digitando">Digitando…</div>` : ''}
        </div>
        <div class="assistente-input-row">
          <input type="text" id="assistente-input" placeholder="Pergunte algo…" ${assistenteEnviando?'disabled':''} />
          <button id="assistente-enviar" ${assistenteEnviando?'disabled':''} title="Enviar">➤</button>
        </div>
      </div>
    ` : ''}
  `;
  if(assistenteAberto) posicionarPainelAssistente();
  ligarBindingsAssistente();
  const lista = document.getElementById('assistente-mensagens-lista');
  if(lista) lista.scrollTop = lista.scrollHeight;
}
// Posiciona o painel de conversa perto de onde a bolinha estiver no momento (ela pode
// ter sido arrastada pra qualquer canto), sempre mantendo ele inteiro dentro da tela.
function posicionarPainelAssistente(){
  const bolha = document.getElementById('assistente-bolha');
  const painel = document.getElementById('assistente-painel');
  if(!bolha || !painel) return;
  const rectBolha = bolha.getBoundingClientRect();
  const largura = 336, altura = 460;
  let left = rectBolha.right - largura;
  let top = rectBolha.top - altura - 12;
  if(top < 12) top = rectBolha.bottom + 12; // não cabe em cima, abre embaixo da bolinha
  left = Math.min(Math.max(12, left), window.innerWidth - largura - 12);
  top = Math.min(Math.max(12, top), window.innerHeight - altura - 12);
  painel.style.left = left+'px';
  painel.style.top = top+'px';
}
async function enviarMensagemAssistente(){
  const input = document.getElementById('assistente-input');
  if(!input) return;
  const texto = input.value.trim();
  if(!texto || assistenteEnviando) return;
  assistenteMensagens.push({ role:'user', content: texto });
  input.value = '';
  assistenteEnviando = true;
  renderAssistente();
  try{
    const data = await apiRequest('POST', '/ai/assistente', { mensagens: assistenteMensagens }, 45000);
    assistenteMensagens.push({ role:'assistant', content: data.resposta || '(sem resposta)' });
  }catch(e){
    assistenteMensagens.push({ role:'assistant', content: 'Não consegui responder agora — ' + (e.message||'tenta de novo em instantes.') });
  }
  assistenteEnviando = false;
  renderAssistente();
}
function ligarBindingsAssistente(){
  const bolha = document.getElementById('assistente-bolha');
  if(bolha){
    bolha.addEventListener('pointerdown', (e)=>{
      assistenteDrag = {
        startX:e.clientX, startY:e.clientY,
        bolhaXInicial: bolha.getBoundingClientRect().left, bolhaYInicial: bolha.getBoundingClientRect().top,
        moveu:false, pointerId:e.pointerId,
      };
      try{ bolha.setPointerCapture(e.pointerId); }catch(err){}
    });
    bolha.addEventListener('pointermove', (e)=>{
      if(!assistenteDrag || assistenteDrag.pointerId!==e.pointerId) return;
      const dx = e.clientX - assistenteDrag.startX;
      const dy = e.clientY - assistenteDrag.startY;
      if(!assistenteDrag.moveu && Math.sqrt(dx*dx+dy*dy) < 5) return; // tremedeira do dedo/mão, não é arrastar de verdade ainda
      assistenteDrag.moveu = true;
      let novoX = assistenteDrag.bolhaXInicial + dx;
      let novoY = assistenteDrag.bolhaYInicial + dy;
      novoX = Math.min(Math.max(4, novoX), window.innerWidth - bolha.offsetWidth - 4);
      novoY = Math.min(Math.max(4, novoY), window.innerHeight - bolha.offsetHeight - 4);
      bolha.style.left = novoX+'px';
      bolha.style.top = novoY+'px';
      bolha.style.right = 'auto';
      bolha.style.bottom = 'auto';
      const painel = document.getElementById('assistente-painel');
      if(painel) posicionarPainelAssistente();
    });
    const soltar = (e)=>{
      if(!assistenteDrag || assistenteDrag.pointerId!==e.pointerId) return;
      if(assistenteDrag.moveu){
        assistenteBolhaX = parseFloat(bolha.style.left);
        assistenteBolhaY = parseFloat(bolha.style.top);
        try{ localStorage.setItem('assistente-bolha-pos', JSON.stringify({x:assistenteBolhaX, y:assistenteBolhaY})); }catch(err){}
      } else {
        assistenteAberto = !assistenteAberto;
        renderAssistente();
      }
      assistenteDrag = null;
    };
    bolha.addEventListener('pointerup', soltar);
    bolha.addEventListener('pointercancel', ()=>{ assistenteDrag = null; });
  }
  const fecharBtn = document.getElementById('assistente-fechar');
  if(fecharBtn) fecharBtn.addEventListener('click', ()=>{ assistenteAberto = false; renderAssistente(); });
  const enviarBtn = document.getElementById('assistente-enviar');
  if(enviarBtn) enviarBtn.addEventListener('click', enviarMensagemAssistente);
  const input = document.getElementById('assistente-input');
  if(input){
    input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') enviarMensagemAssistente(); });
  }
}
window.addEventListener('resize', ()=>{ if(assistenteAberto) posicionarPainelAssistente(); });

function renderApp(){
  const app = document.getElementById('app');
  if(!loaded){ app.innerHTML = '<div class="loading">Carregando painel…</div>'; return; }

  let pageHtml = '';
  if(currentPage === 'dashboard') pageHtml = renderDashboardPage();
  else if(currentPage === 'pipeline') pageHtml = renderPipelinePage();
  else if(currentPage === 'leads') pageHtml = renderLeadsPage();
  else if(currentPage === 'conversas') pageHtml = renderConversasPage();
  else if(currentPage === 'comissoes') pageHtml = renderComissoesPage();
  else if(currentPage === 'relatorios') pageHtml = renderRelatoriosPage();
  else if(currentPage === 'disparos') pageHtml = renderDisparosPage();
  else if(currentPage === 'automacoes') pageHtml = renderAutomacoesPage();
  else if(currentPage === 'fluxos') pageHtml = renderFluxosPage();
  else if(currentPage === 'agendamentos') pageHtml = renderAgendamentosPage();
  else if(currentPage === 'import-export') pageHtml = renderImportExportPage();
  else if(currentPage === 'configuracoes') pageHtml = renderConfiguracoesPage();
  else if(currentPage === 'suporte') pageHtml = renderSuportePage();
  else if(currentPage === 'equipe') pageHtml = renderEquipePage();
  else if(currentPage === 'tarefas') pageHtml = renderTarefasPage();

  const notificacoes = computarNotificacoes();

  app.innerHTML = `
    <div class="app-shell ${sidebarOpen ? 'sidebar-open' : ''}">
      ${renderSidebar()}
      <div class="sidebar-backdrop" data-action="close-sidebar"></div>
      <div class="main-area ${currentPage==='pipeline' ? 'main-area-pipeline' : ''}">
        <div class="main-topbar">
          <button class="hamburger-btn" data-action="toggle-sidebar" title="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div class="topbar-right">
            <button class="notif-btn" data-action="abrir-busca-global" title="Buscar (Ctrl+K)">
              ${ICON_BUSCA}
            </button>
            <div class="notif-wrap">
              <button class="notif-btn" data-action="toggle-notif" title="Notificações">
                ${ICON_BELL}
                ${notificacoes.length ? `<span class="notif-badge">${notificacoes.length > 9 ? '9+' : notificacoes.length}</span>` : ''}
              </button>
              ${notifOpen ? `
                <div class="notif-panel">
                <div class="notif-panel-title">Notificações</div>
                ${notificacoes.length ? notificacoes.slice(0,8).map(n=>`
                  <div class="notif-item" ${n.cardId ? `data-action="open-edit-card" data-card-id="${n.cardId}"` : ''}>
                    <p>${esc(n.texto)}</p>
                    <span>${formatDateHora(n.timestamp)}</span>
                  </div>
                `).join('') : '<p class="settings-page-note" style="padding:12px;">Nenhuma notificação por enquanto.</p>'}
              </div>
            ` : ''}
          </div>
          </div>
        </div>
        ${errorMsg ? `<div class="error-banner" data-action="dismiss-error" title="Clique para fechar">⚠ ${esc(errorMsg)}</div>` : ''}
        ${pageHtml}
      </div>
    </div>
  `;

  bindAppEvents();
}

const NAV_PADRAO = [
  ['dashboard', 'Dashboard', ICON_DASHBOARD],
  ['pipeline', 'Pipeline', ICON_PIPELINE],
  ['leads', 'Leads', ICON_LEADS],
  ['conversas', 'Conversas', ICON_CONVERSAS],
  ['comissoes', 'Comissões', ICON_COMISSOES],
  ['relatorios', 'Relatórios', ICON_RELATORIOS],
  ['fluxos', 'Fluxos', ICON_FLUXOS],
  ['import-export', 'Importar/Exportar', ICON_IMPORT_EXPORT],
  ['equipe', 'Equipe', ICON_CHAT_INTERNO],
  ['tarefas', 'Agenda/Tarefas', ICON_TASKS],
];
function getOrdemNavSalva(){
  try{ return JSON.parse(localStorage.getItem('navOrdem') || 'null'); }catch(e){ return null; }
}
// Devolve o NAV na ordem escolhida pelo usuário — se ele nunca reordenou, ou se um
// item novo foi adicionado depois (ex: uma página nova), cai no padrão / vai pro fim.
function getNavOrdenado(){
  const ordemSalva = getOrdemNavSalva();
  if(!ordemSalva || !ordemSalva.length) return NAV_PADRAO;
  const porChave = Object.fromEntries(NAV_PADRAO.map(item=>[item[0], item]));
  const resultado = ordemSalva.map(chave=>porChave[chave]).filter(Boolean);
  NAV_PADRAO.forEach(item=>{ if(!ordemSalva.includes(item[0])) resultado.push(item); });
  return resultado;
}
let reordenarNavAberto = false;
let reordenarNavOrdemTemp = null;

function abrirReordenarNav(){
  reordenarNavOrdemTemp = getNavOrdenado().map(item=>item[0]);
  reordenarNavAberto = true;
  renderReordenarNavModal();
}
function closeReordenarNavModal(){
  reordenarNavAberto = false;
  reordenarNavOrdemTemp = null;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function moverItemNavOrdem(chave, direcao){
  const idx = reordenarNavOrdemTemp.indexOf(chave);
  const novoIdx = idx + direcao;
  if(idx===-1 || novoIdx < 0 || novoIdx >= reordenarNavOrdemTemp.length) return;
  [reordenarNavOrdemTemp[idx], reordenarNavOrdemTemp[novoIdx]] = [reordenarNavOrdemTemp[novoIdx], reordenarNavOrdemTemp[idx]];
  renderReordenarNavModal();
}
function salvarOrdemNav(){
  localStorage.setItem('navOrdem', JSON.stringify(reordenarNavOrdemTemp));
  closeReordenarNavModal();
  renderApp();
}
function restaurarOrdemNavPadrao(){
  localStorage.removeItem('navOrdem');
  closeReordenarNavModal();
  renderApp();
}
function renderReordenarNavModal(){
  const root = document.getElementById('modal-root');
  if(!reordenarNavAberto){ root.innerHTML=''; return; }
  const porChave = Object.fromEntries(NAV_PADRAO.map(item=>[item[0], item]));
  root.innerHTML = `
    <div class="overlay" id="reordenar-nav-overlay">
      <div class="modal reordenar-nav-modal">
        <div class="modal-head">
          <h3>Reordenar abas</h3>
          <button id="reordenar-nav-close">✕</button>
        </div>
        <div class="modal-body">
          <p class="settings-page-note" style="margin-bottom:12px;">Use as setinhas pra mudar a ordem que as abas aparecem no menu.</p>
          <div class="reordenar-nav-lista">
            ${reordenarNavOrdemTemp.map((chave, idx)=>{
              const item = porChave[chave];
              if(!item) return '';
              const [key, label, icon] = item;
              return `
                <div class="reordenar-nav-item">
                  ${icon}
                  <span>${esc(label)}</span>
                  <div class="reordenar-nav-setas">
                    <button class="icon-btn" data-mover="${key}" data-dir="-1" ${idx===0?'disabled':''} title="Mover pra cima">↑</button>
                    <button class="icon-btn" data-mover="${key}" data-dir="1" ${idx===reordenarNavOrdemTemp.length-1?'disabled':''} title="Mover pra baixo">↓</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        <div class="modal-foot">
          <button class="delete-link" id="reordenar-nav-restaurar">Restaurar padrão</button>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="reordenar-nav-cancelar">Cancelar</button>
            <button class="btn-save" id="reordenar-nav-salvar">Salvar ordem</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('reordenar-nav-close').addEventListener('click', closeReordenarNavModal);
  document.getElementById('reordenar-nav-cancelar').addEventListener('click', closeReordenarNavModal);
  document.getElementById('reordenar-nav-overlay').addEventListener('click', (e)=>{ if(e.target.id==='reordenar-nav-overlay') closeReordenarNavModal(); });
  document.getElementById('reordenar-nav-salvar').addEventListener('click', salvarOrdemNav);
  document.getElementById('reordenar-nav-restaurar').addEventListener('click', restaurarOrdemNavPadrao);
  root.querySelectorAll('[data-mover]').forEach(btn=>{
    btn.addEventListener('click', ()=> moverItemNavOrdem(btn.dataset.mover, parseInt(btn.dataset.dir,10)));
  });
}

function renderSidebar(){
  const NAV = getNavOrdenado();
  return `
    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="sidebar-avatar">${currentUser && currentUser.avatarUrl ? `<img src="${currentUser.avatarUrl}" alt="" />` : esc(iniciaisDoNome((currentUser&&currentUser.nome)||''))}</span>
        <span class="sidebar-greeting">Olá, <span class="sidebar-brand-name">${esc((currentUser && currentUser.nome) || 'visitante')}</span></span>
      </div>
      <nav class="sidebar-nav">
        ${NAV.map(([key,label,icon])=>`
          <button class="nav-item ${currentPage===key?'active':''}" data-action="nav" data-page="${key}">${icon}<span>${label}</span></button>
        `).join('')}
      </nav>
      <div class="nav-reordenar-wrap">
        <button class="nav-item nav-reordenar-btn" data-action="abrir-reordenar-nav" title="Mudar a ordem das abas">${ICON_REORDER}<span>Reordenar abas</span></button>
      </div>
      <div class="sidebar-footer">
        <button class="nav-item ${currentPage==='suporte'?'active':''}" data-action="nav" data-page="suporte">${ICON_SUPORTE}<span>Suporte</span></button>
        <button class="nav-item ${currentPage==='configuracoes'?'active':''}" data-action="nav" data-page="configuracoes">${ICON_SETTINGS}<span>Configurações</span></button>
        <button class="nav-item logout-item" data-action="logout">${ICON_LOGOUT}<span>Sair</span></button>
      </div>
    </aside>
  `;
}

/* ---------- página: Dashboard ---------- */
// Painéis recolhíveis do Dashboard — o estado (aberto/fechado) fica salvo no
// localStorage do navegador, então continua do jeito que a pessoa deixou mesmo
// depois de fechar e abrir o CRM de novo.
function painelDashboardAberto(id){
  try{
    const v = localStorage.getItem('dash-painel-'+id);
    return v === null ? true : v === '1'; // aberto por padrão, antes da primeira vez que a pessoa mexe
  }catch(e){ return true; }
}
function renderCabecalhoPainelDashboard(id, titulo, extraHtml){
  const aberto = painelDashboardAberto(id);
  return `
    <div class="dash-panel-title dash-panel-title-recolhivel" style="${aberto?'':'margin-bottom:0;'}">
      <button type="button" class="dash-panel-toggle" data-action="toggle-painel-dashboard" data-painel-id="${id}">
        <span class="dash-panel-seta ${aberto?'':'fechada'}">▾</span> ${titulo}
      </button>
      ${extraHtml||''}
    </div>
  `;
}
// Envolve o conteúdo de um painel numa estrutura que anima o recolher/abrir suavemente
// (usa grid-template-rows 1fr↔0fr, que consegue animar até uma altura "automática"
// sem precisar saber o tamanho do conteúdo de antemão — ao contrário de max-height,
// que precisa de um valor fixo chutado). O conteúdo fica sempre no DOM; é só a altura
// visível que encolhe a zero quando fechado.
function envolverConteudoPainel(id, conteudoHtml){
  const aberto = painelDashboardAberto(id);
  return `
    <div class="dash-panel-collapse" id="dash-collapse-${id}" style="max-height:${aberto ? 'none' : '0px'};">
      <div class="dash-panel-collapse-inner">${conteudoHtml}</div>
    </div>
  `;
}
// Abre/fecha um painel específico do Dashboard sem redesenhar a página inteira — se
// redesenhasse tudo (como o resto do app costuma fazer), o elemento nasceria de novo
// já no estado final, sem um "antes" pra animação partir. Mede a altura real do
// conteúdo em pixels (em vez de usar grid-template-rows com fr, que tem suporte menos
// confiável entre navegadores) e anima o max-height até lá.
function alternarPainelDashboard(id, btn){
  const vaiAbrir = !painelDashboardAberto(id);
  try{ localStorage.setItem('dash-painel-'+id, vaiAbrir ? '1' : '0'); }catch(e){}

  const seta = btn.querySelector('.dash-panel-seta');
  if(seta) seta.classList.toggle('fechada', !vaiAbrir);
  const tituloEl = btn.closest('.dash-panel-title-recolhivel');
  if(tituloEl) tituloEl.style.marginBottom = vaiAbrir ? '' : '0';

  const colapseEl = document.getElementById('dash-collapse-'+id);
  if(!colapseEl) return;
  const innerEl = colapseEl.querySelector('.dash-panel-collapse-inner');

  if(vaiAbrir){
    const alturaFinal = innerEl.scrollHeight;
    colapseEl.style.maxHeight = alturaFinal + 'px';
    colapseEl.addEventListener('transitionend', function liberar(e){
      if(e.propertyName !== 'max-height') return;
      if(painelDashboardAberto(id)) colapseEl.style.maxHeight = 'none'; // libera de vez, pro conteúdo poder crescer depois sem ficar cortado
      colapseEl.removeEventListener('transitionend', liberar);
    });
  } else {
    colapseEl.style.maxHeight = colapseEl.scrollHeight + 'px'; // trava num valor explícito — estava em "none", que não é animável
    colapseEl.offsetHeight; // força o navegador a registrar esse valor antes da próxima mudança
    requestAnimationFrame(()=>{
      colapseEl.style.maxHeight = '0px';
    });
  }
}
function renderDashboardPage(){
  const m = dashMetrics();
  const stages = stageTotals();
  const maxStage = Math.max(1, ...stages.map(s=>s.total));
  const recentes = [...cardsInPeriod()].sort((a,b)=> new Date(b.createdAt||0) - new Date(a.createdAt||0)).slice(0,5);
  const tarefasSemHora = tasksLoaded ? tasks.filter(t=>!t.concluida && !horaLocalDaTarefaOuNull(t.vencimento)).map(t=>({ tipo:'tarefa', id:t.id, titulo:t.titulo, data:t.vencimento })) : [];
  // eventos do Google são pessoais do próprio gestor — não fazem sentido (e vazariam
  // dados privados) quando ele está olhando o dashboard de outra pessoa
  const eventosSemHoraDash = (agendaLoaded && !visualizandoDashboardDe) ? agendaEventosGoogle.filter(e=>e.diaInteiro && !e.concluida).map(e=>({ tipo:'evento', id:e.id, titulo:e.titulo, data:e.inicio })) : [];
  const abertas = [...tarefasSemHora, ...eventosSemHoraDash].sort((a,b)=> new Date(a.data||'2999-01-01') - new Date(b.data||'2999-01-01')).slice(0,5);

  return `
    ${visualizandoDashboardDe ? `
      <div class="dashboard-readonly-banner">
        <span>👁️ Você está vendo o dashboard de <b>${esc(visualizandoDashboardDe.nome)}</b> — somente leitura, nada aqui pode ser alterado.</span>
        <button type="button" class="btn-outline" data-action="sair-dashboard-membro">← Voltar</button>
      </div>
    ` : ''}
    <div class="page-head">
      <div>
        <h1>Dashboard</h1>
        <p>Visão geral do seu funil de vendas</p>
      </div>
      <div class="period-toggle">
        ${[['7dias','7 dias'],['mes','Mês'],['trimestre','Trimestre'],['ano','Ano']].map(([key,label])=>`
          <button class="tab-btn ${dashboardPeriod===key?'active':''}" data-action="set-dash-period" data-period="${key}">${label}</button>
        `).join('')}
      </div>
    </div>

    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-card-top"><span>Novos leads</span><span class="metric-icon">${ICON_USERS}</span></div>
        <div class="metric-value">${m.novosLeads}</div>
        <div class="metric-sub">no período</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span>Em negociação</span><span class="metric-icon">${ICON_DOLLAR}</span></div>
        <div class="metric-value">${fmtBRL(m.emNegociacaoValor)}</div>
        <div class="metric-sub">${m.emNegociacaoCount} ${m.emNegociacaoCount===1?'negócio':'negócios'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span>Ganho</span><span class="metric-icon">${ICON_TROPHY}</span></div>
        <div class="metric-value">${fmtBRL(m.ganhoValor)}</div>
        <div class="metric-sub">${m.ganhoCount} fechados</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span>Conversão</span><span class="metric-icon">${ICON_TREND}</span></div>
        <div class="metric-value">${m.conversao}%</div>
        <div class="metric-sub">ganhos / fechados</div>
      </div>
    </div>

    <div class="dash-grid" style="margin-bottom:20px;">
      <div class="dash-panel">
        ${renderCabecalhoPainelDashboard('meta-individual', 'Meta de vendas do mês', (!editandoMetaVendas && !visualizandoDashboardDe) ? `<button class="icon-btn" data-action="editar-meta-vendas" title="Editar meta">${ICON_EDIT}</button>` : '')}
        ${envolverConteudoPainel('meta-individual', !metaVendasCarregada ? `<p class="settings-page-note">Carregando…</p>` : (editandoMetaVendas ? `
          <div class="field-row" style="align-items:flex-end;">
            <div class="field"><label>Meta do mês (R$)</label><input type="number" id="meta-vendas-input" value="${metaVendasValor||0}" min="0" step="0.01" /></div>
            <button class="btn-primary" id="meta-vendas-salvar" style="margin-bottom:14px;">Salvar</button>
          </div>
        ` : (metaVendasValor > 0 ? `
          <div class="meta-vendas-track"><div class="meta-vendas-fill" style="width:${Math.min(100, (vendidoNoMesAtual()/metaVendasValor*100))}%"></div></div>
          <p class="settings-page-note">${fmtBRL(vendidoNoMesAtual())} de ${fmtBRL(metaVendasValor)} — ${Math.round(Math.min(999,vendidoNoMesAtual()/metaVendasValor*100))}%</p>
        ` : `<p class="dash-empty">Nenhuma meta definida pra este mês.</p>`)))}
      </div>
      ${equipe ? `
        <div class="dash-panel">
          ${renderCabecalhoPainelDashboard('meta-equipe', 'Meta de vendas da equipe', (equipe.souSupervisor && !editandoMetaVendasEquipe && !visualizandoDashboardDe) ? `<button class="icon-btn" data-action="editar-meta-vendas-equipe" title="Editar meta">${ICON_EDIT}</button>` : '')}
          ${envolverConteudoPainel('meta-equipe', !metaVendasEquipeCarregada ? `<p class="settings-page-note">Carregando…</p>` : (editandoMetaVendasEquipe ? `
            <div class="field-row" style="align-items:flex-end;">
              <div class="field"><label>Meta da equipe no mês (R$)</label><input type="number" id="meta-vendas-equipe-input" value="${metaVendasEquipeValor||0}" min="0" step="0.01" /></div>
              <button class="btn-primary" id="meta-vendas-equipe-salvar" style="margin-bottom:14px;">Salvar</button>
            </div>
          ` : `
            <div class="meta-vendas-track"><div class="meta-vendas-fill" style="width:${metaVendasEquipeValor ? Math.min(100, (metaVendasEquipeVendido/metaVendasEquipeValor*100)) : 0}%"></div></div>
            <p class="settings-page-note">${fmtBRL(metaVendasEquipeVendido)} de ${fmtBRL(metaVendasEquipeValor)} — ${metaVendasEquipeValor ? Math.round(Math.min(999,metaVendasEquipeVendido/metaVendasEquipeValor*100)) : 0}%</p>
          `))}
        </div>
      ` : ''}
    </div>

    <div class="dash-grid">
      <div class="dash-panel">
        ${renderCabecalhoPainelDashboard('leads-captados', 'Leads captados')}
        ${envolverConteudoPainel('leads-captados', renderLeadsChart())}
      </div>
      <div class="dash-panel">
        ${renderCabecalhoPainelDashboard('pipeline-etapa', 'Pipeline por etapa')}
        ${envolverConteudoPainel('pipeline-etapa', `
        <div class="stage-list">
          ${stages.length ? stages.map(s=>`
            <div class="stage-row">
              <div class="stage-row-top"><span>${esc(s.col.nome)}</span><span>${fmtBRL(s.total)}</span></div>
              <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${maxStage ? (s.total/maxStage*100) : 0}%"></div></div>
            </div>
          `).join('') : '<p class="dash-empty">Nenhuma coluna criada ainda.</p>'}
        </div>
        `)}
      </div>
    </div>

    <div class="dash-grid">
      <div class="dash-panel">
        ${renderCabecalhoPainelDashboard('ultimos-leads', 'Últimos leads')}
        ${envolverConteudoPainel('ultimos-leads', recentes.length ? `<div class="recent-list">${recentes.map(c=>`
          <div class="recent-item"><span class="recent-name">${esc(c.cliente) || 'Sem nome'}</span><span class="recent-value">${fmtBRL(c.valor)}</span></div>
        `).join('')}</div>` : '<p class="dash-empty">Nenhum lead neste período.</p>')}
      </div>
      <div class="dash-panel">
        ${renderCabecalhoPainelDashboard('tarefas-abertas', 'Tarefas abertas')}
        ${envolverConteudoPainel('tarefas-abertas', abertas.length ? `<div class="recent-list">${abertas.map(t=>`
          <div class="task-mini-item">
            ${t.tipo==='evento'
              ? `<span class="check-circle" data-action="toggle-evento" data-evento-id="${t.id}"></span>`
              : (visualizandoDashboardDe ? `<span class="check-circle" style="cursor:default;"></span>` : `<span class="check-circle" data-action="toggle-task" data-task-id="${t.id}"></span>`)
            }
            <span class="task-mini-title">${esc(t.titulo)}</span>
            ${t.data ? `<span class="metric-sub">${formatDate(t.data)}</span>` : ''}
          </div>
        `).join('')}</div>` : '<p class="dash-empty">Tudo em dia por aqui.</p>')}
      </div>
    </div>
  `;
}

/* ---------- página: Pipeline (o quadro kanban, como já era) ---------- */
function renderPipelinePage(){
  if(!funisLoaded){
    return `<div class="page-head"><div><h1>Pipeline</h1><p>Carregando…</p></div></div>`;
  }
  const months = monthsList();
  const funilAtual = funis.find(f=>f.id===funilAtualId);
  const columnsDoFunil = board.columns.filter(c=>c.funilId===funilAtualId);
  return `
    <div class="page-head">
      <div>
        <h1>Pipeline</h1>
        <p>Arraste os clientes para mudar de coluna</p>
      </div>
    </div>

    <div class="funil-tabs">
      ${funis.map(f=>{
        if(editingFunilId===f.id){
          return `<input class="funil-name-input" id="funil-rename-${f.id}" value="${esc(editingFunilName)}" />`;
        }
        return `<button class="tab-btn ${funilAtualId===f.id?'active':''}" data-action="set-funil" data-funil-id="${f.id}">${esc(f.nome)}</button>`;
      }).join('')}
      ${funilAtual ? `
        <button class="icon-btn" data-action="edit-funil-name" data-funil-id="${funilAtual.id}" title="Renomear funil">${ICON_EDIT}</button>
        <button class="icon-btn" data-action="duplicar-funil" data-funil-id="${funilAtual.id}" title="Duplicar funil (só a estrutura de colunas)">⧉</button>
        ${funis.length > 1 ? `<button class="icon-btn" data-action="delete-funil" data-funil-id="${funilAtual.id}" title="Excluir funil">${ICON_TRASH}</button>` : ''}
      ` : ''}
      <button class="tab-btn" data-action="open-new-funil" title="Criar novo funil">+ Funil</button>
    </div>

    <div class="tabs">
      <button class="tab-btn ${filterMonth===null?'active':''}" data-action="set-month" data-month="">Geral</button>
      <div class="date-wrap">
        <button class="tab-btn ${filterMonth?'active':''}" data-action="toggle-date-menu">
          📅 ${filterMonth ? monthLabel(filterMonth) : 'Escolher data'}
        </button>
        ${dateMenuOpen ? `
          <div class="date-menu">
            <div class="date-menu-title">Meses com dados</div>
            ${months.length ? `
              <div class="date-menu-list">
                ${months.map(m=>`<button class="date-menu-item ${filterMonth===m?'active':''}" data-action="set-month" data-month="${m}">${monthLabel(m, true)}</button>`).join('')}
              </div>
            ` : `<p class="date-menu-empty">Nenhum mês com dados ainda.</p>`}
            <div class="date-menu-sep"></div>
            <label class="date-menu-custom-label">
              Ir para outro mês
              <input type="month" id="goto-month-input" value="${filterMonth||''}" />
            </label>
          </div>
        ` : ''}
      </div>
      <button class="tab-btn ${filtroEsfriando?'active':''}" data-action="toggle-esfriando" title="Leads em aberto sem atividade há mais de 7 dias">🧊 Esfriando</button>
    </div>

    <div class="stats-wrap-fixo">
      <div class="stats-wrap">
        <div class="stats">
          <div class="stats-label">Resumo · ${filterMonth ? monthLabel(filterMonth, true) : 'Geral (todos os meses)'}</div>
          <div class="stats-row">
            ${renderStatItem('aberto', 'Em negociação', fmtBRL(sumByTipo('aberto')), `${countByTipo('aberto')} ${countByTipo('aberto')===1?'cliente':'clientes'}`)}
            ${renderStatItem('ganho', 'Vendido', fmtBRL(sumByTipo('ganho')), `${countByTipo('ganho')} ${countByTipo('ganho')===1?'cliente':'clientes'}`)}
            ${renderStatItem('perdido', 'Perdido', fmtBRL(sumByTipo('perdido')), `${countByTipo('perdido')} ${countByTipo('perdido')===1?'cliente':'clientes'}`, 'rgba(255,255,255,.45)')}
            ${renderStatItem('quentes', 'Leads quentes', quentesAtivos())}
            ${renderStatItem('ticket', 'Ticket médio', fmtBRL(ticketMedioFunil()))}
            ${renderStatItem('ponderado', 'Valor ponderado', fmtBRL(valorPonderadoFunil()))}
          </div>
        </div>
      </div>
    </div>

    <div class="pipeline-insights-bar">
      <button class="pipeline-insights-toggle" data-action="toggle-insights-pipeline">
        <span>${ICON_SPARKLE} Insights da IA sobre esse funil</span>
        <span class="auditoria-toggle-seta ${insightsPipelineExpandido?'aberta':''}">▾</span>
      </button>
      ${insightsPipelineExpandido ? `
        <div class="pipeline-insights-conteudo">
          <button class="btn-outline" data-action="gerar-insights" ${insightsCarregando?'disabled':''}>${insightsCarregando?'Gerando…':'Gerar'}</button>
          ${aiInsights.length
            ? `<ul class="ai-insights-list">${aiInsights.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>`
            : `<p class="dash-empty">Clique em "Gerar" para receber alertas sobre esse funil.</p>`
          }
        </div>
      ` : ''}
    </div>

    <div class="pipeline-ordenar-row">
      ${renderBotaoOrdenar('pipeline', pipelineOrdenarPor, 'Ordem manual (arrastar)')}
      ${pipelineOrdenando ? `<span class="settings-page-note">Reordenando…</span>` : ''}
    </div>

    <main class="pipeline-main">
      <div class="board">
        ${columnsDoFunil.map(col => renderColumn(col)).join('')}
        <div class="add-col-wrap">
          ${addingCol ? `
            <div class="add-col-form">
              <input type="text" id="new-col-input" placeholder="Nome da coluna" value="${esc(newColNameVal)}" />
              <select id="new-col-tipo" class="add-col-tipo-select">
                ${Object.entries(TIPOS).map(([key,t])=>`<option value="${key}" ${newColTipoVal===key?'selected':''}>${t.label}</option>`).join('')}
              </select>
              <div class="add-col-actions">
                <button class="btn-primary" data-action="confirm-add-col">Adicionar</button>
                <button class="btn-ghost" data-action="cancel-add-col">Cancelar</button>
              </div>
            </div>
          ` : `
            <button class="add-col-btn" data-action="start-add-col">+ Nova coluna</button>
          `}
        </div>
      </div>
    </main>
  `;
}

function renderColumn(col){
  const cards = cardsOf(col.id);
  const tipo = TIPOS[col.tipo] || TIPOS.aberto;
  const total = cards.reduce((s,c)=> s + (Number(c.valor)||0), 0);
  const isEditing = editingColId === col.id;
  const menuOpen = openMenuColId === col.id;

  return `
    <div class="column" data-col-id="${col.id}">
      <div class="col-head">
        <div class="col-head-top">
          <span class="grip" draggable="true" data-action="drag-col-handle" data-col-id="${col.id}" title="Arraste para reordenar">⠿</span>
          ${isEditing
            ? `<input class="col-name-input" id="col-rename-${col.id}" value="${esc(editingColName)}" />`
            : `<span class="col-name" data-action="edit-col-name" data-col-id="${col.id}" title="Clique para renomear">${esc(col.nome)}</span>`
          }
          <button class="col-add-btn" data-action="open-add-lead-choice" data-col-id="${col.id}" title="Adicionar cliente">+</button>
          <button class="col-menu-btn" data-action="toggle-col-menu" data-col-id="${col.id}">▾</button>
        </div>
        <div class="col-meta">
          <span class="badge" style="color:${tipo.color};background:${tipo.bg};${tipo.strike ? 'text-decoration:line-through;' : ''}">${tipo.label}</span>
          <span class="col-total">${fmtBRL(total)}</span>
        </div>
        ${menuOpen ? `
          <div class="col-menu">
            <div class="col-menu-title">Marcar coluna como</div>
            ${Object.entries(TIPOS).map(([key,t])=>`
              <button class="col-menu-item" data-action="set-col-tipo" data-col-id="${col.id}" data-tipo="${key}">
                <span class="dot" style="background:${t.color}"></span>${t.label} ${col.tipo===key?'✓':''}
              </button>
            `).join('')}
            ${col.tipo==='aberto' ? `
              <div class="col-menu-sep">
                <label class="col-menu-prob-label">
                  Chance de fechar (%) — usado no valor ponderado
                  <input type="number" class="col-menu-prob-input" data-col-id="${col.id}" value="${col.probabilidade!=null?col.probabilidade:50}" min="0" max="100" />
                </label>
              </div>
            ` : ''}
            <div class="col-menu-sep">
              <button class="col-menu-item danger" data-action="delete-col" data-col-id="${col.id}">🗑 Excluir coluna</button>
            </div>
          </div>
        ` : ''}
      </div>

      <div class="cards" data-col-id="${col.id}">
        ${cards.length===0 ? '<p class="empty-col">Nenhum cliente aqui ainda</p>' : cards.map(card=>renderCard(card)).join('')}
      </div>
    </div>
  `;
}

// Deixa o total da coluna (quando o valor é grande demais e fica cortado)
// arrastável com o mouse, além do toque/trackpad que o overflow-x já dá de graça.
// mousemove/mouseup ficam registrados uma única vez (fora do render) pra não
// acumular ouvintes a cada nova renderização — só o mousedown é religado por
// elemento, já que os elementos em si são recriados a cada render.
let arrasteHorizontalState = null;
document.addEventListener('mousemove', (e)=>{
  if(!arrasteHorizontalState) return;
  e.preventDefault();
  arrasteHorizontalState.el.scrollLeft = arrasteHorizontalState.scrollInicial - (e.pageX - arrasteHorizontalState.inicioX);
});
document.addEventListener('mouseup', ()=>{
  if(!arrasteHorizontalState) return;
  arrasteHorizontalState.el.classList.remove('dragging');
  arrasteHorizontalState = null;
});
// Mede a altura de verdade do bloco fixo do resumo (em vez de chutar um valor em
// pixels) e usa isso pra calcular exatamente quanto sobra de tela pra coluna — sem
// esse cálculo, ou a coluna fica curta demais (sobra espaço vazio embaixo) ou alta
// demais (esconde atrás do resumo ao rolar até o fim da página).
/* ---------- resumo do Pipeline: largura de cada número, redimensionável ---------- */
const STAT_KEYS = ['aberto','ganho','perdido','quentes','ticket','ponderado'];
const STAT_LARGURA_PADRAO = 220;
const STAT_LARGURA_MIN = 130;
function getLargurasStats(){
  let salvo = {};
  try{ salvo = JSON.parse(localStorage.getItem('statsLargura') || '{}'); }catch(e){ salvo = {}; }
  return salvo;
}
let statsLargura = getLargurasStats();
// Só ajusta quem NUNCA foi redimensionado manualmente pelo usuário — distribui o
// espaço da caixa azul igualmente entre eles, sem nunca deixar menor que o padrão
// (pra nenhum número começar cortado) nem deixar espaço vazio sobrando.
function ajustarLargurasStatsPadrao(){
  if(currentPage !== 'pipeline') return;
  const statsEl = document.querySelector('.stats');
  if(!statsEl) return;
  const chavesNaoCustomizadas = STAT_KEYS.filter(k => statsLargura[k] === undefined);
  if(!chavesNaoCustomizadas.length) return; // tudo já foi ajustado manualmente, respeita a escolha do usuário
  const larguraTotalCustomizada = STAT_KEYS.reduce((s,k)=> s + (statsLargura[k] || 0), 0);
  const larguraDisponivel = statsEl.getBoundingClientRect().width - larguraTotalCustomizada;
  const larguraIdeal = Math.max(STAT_LARGURA_PADRAO, Math.floor(larguraDisponivel / chavesNaoCustomizadas.length));
  chavesNaoCustomizadas.forEach(chave=>{
    const statEl = document.querySelector(`.stat[data-stat-key="${chave}"]`);
    if(statEl) statEl.style.width = larguraIdeal + 'px';
  });
}
function renderStatItem(chave, label, valor, contagem, corValor){
  const largura = statsLargura[chave] || STAT_LARGURA_PADRAO;
  return `
    <div class="stat" data-stat-key="${chave}" style="width:${largura}px;">
      <span class="lbl">${esc(label)}</span>
      <span class="val" ${corValor ? `style="color:${corValor}"` : ''}>${valor}</span>
      ${contagem ? `<span class="cnt">${esc(contagem)}</span>` : ''}
      <div class="stat-resize-handle" data-stat-key="${chave}" title="Arraste para redimensionar"></div>
    </div>
  `;
}
let resizeStatState = null;
document.addEventListener('mousemove', (e)=>{
  if(!resizeStatState) return;
  e.preventDefault();
  const delta = e.pageX - resizeStatState.startX;
  const novaLargura = Math.max(STAT_LARGURA_MIN, Math.round(resizeStatState.startWidth + delta));
  statsLargura[resizeStatState.key] = novaLargura;
  const statEl = document.querySelector(`.stat[data-stat-key="${resizeStatState.key}"]`);
  if(statEl) statEl.style.width = novaLargura + 'px';
});
document.addEventListener('mouseup', ()=>{
  if(!resizeStatState) return;
  resizeStatState = null;
  localStorage.setItem('statsLargura', JSON.stringify(statsLargura));
});
function ativarRedimensionarStats(){
  document.querySelectorAll('.stat-resize-handle').forEach(handle=>{
    handle.addEventListener('mousedown', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      const statEl = handle.closest('.stat');
      resizeStatState = { key: handle.dataset.statKey, startX: e.pageX, startWidth: statEl.getBoundingClientRect().width };
    });
  });
}

function ajustarAlturaColunasPipeline(){
  if(currentPage !== 'pipeline') return;
  const resumoFixo = document.querySelector('.stats-wrap-fixo');
  if(!resumoFixo) return;
  const alturaResumo = resumoFixo.getBoundingClientRect().height;
  const margemExtra = 12; // respiro entre o resumo e o topo das colunas + a barra de rolagem horizontal
  document.documentElement.style.setProperty('--altura-coluna-pipeline', `calc(100vh - ${Math.ceil(alturaResumo + margemExtra)}px)`);
}
window.addEventListener('resize', ()=>{ ajustarAlturaColunasPipeline(); ajustarLargurasStatsPadrao(); });

function ativarArrasteHorizontal(){
  document.querySelectorAll('.col-total').forEach(el=>{
    el.addEventListener('mousedown', (e)=>{
      arrasteHorizontalState = { el, inicioX: e.pageX, scrollInicial: el.scrollLeft };
      el.classList.add('dragging');
    });
  });
}
function renderCard(card){
  const temp = TEMPS[card.temperatura] || TEMPS.frio;
  const showMonth = filterMonth === null && card.mesInicioContato;
  return `
    <div class="card" draggable="true" data-card-id="${card.id}">
      <div class="card-drag-handle" title="Arraste para mover">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="3" r="1.4"/><circle cx="11" cy="3" r="1.4"/>
          <circle cx="5" cy="8" r="1.4"/><circle cx="11" cy="8" r="1.4"/>
          <circle cx="5" cy="13" r="1.4"/><circle cx="11" cy="13" r="1.4"/>
        </svg>
      </div>
      <div class="card-move-wrap">
        <button class="card-move-btn" data-action="toggle-move-menu" data-card-id="${card.id}" title="Mover pra outra coluna">${ICON_MOVE}</button>
      </div>
      <div class="card-main">
        <div class="card-perf"></div>
        <div class="card-body" data-action="open-edit-card" data-card-id="${card.id}">
          <div class="card-top">
            <span class="card-name">${card.tipoPessoa==='juridica' ? '🏢 ' : ''}${esc(card.cliente) || 'Sem nome'}</span>
            <span class="temp-badge" style="color:${temp.color};background:${temp.bg}">${temp.emoji} ${temp.label}</span>
          </div>
          <div class="card-value-row">
            <span class="card-value">${fmtBRL(card.valor)}</span>
            ${showMonth ? `<span class="month-badge">${monthLabel(card.mesInicioContato)}</span>` : ''}
          </div>
          ${(card.telefone || card.obs) ? `
            <div class="card-extra">
              ${card.telefone ? `
                <div class="card-phone-row">
                  <span class="phone-text">☎ ${esc(card.telefone)}</span>
                  <button class="wa-btn" data-action="open-whatsapp" data-phone="${esc(card.telefone)}" title="Abrir conversa no WhatsApp">
                    ${WA_ICON} WhatsApp
                  </button>
                </div>
              ` : ''}
              ${card.obs ? `<p>${esc(card.obs)}</p>` : ''}
            </div>
          ` : ''}
          ${(card.etiquetas||[]).length ? `<div class="etiquetas-pills">${card.etiquetas.map(et=>`<span class="etiqueta-pill">${esc(et)}</span>`).join('')}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

/* ---------- página: Leads ---------- */
function renderLeadsPage(){
  const leads = filteredLeads();
  const idsVisiveis = leads.map(c=>c.id);
  const todosSelecionados = idsVisiveis.length>0 && idsVisiveis.every(id=>leadsSelecionados.has(id));
  return `
    <div class="page-head">
      <div>
        <h1>Leads</h1>
        <p>${board.cards.length} ${board.cards.length===1?'contato':'contatos'} na sua base</p>
      </div>
      <div class="page-head-actions">
        <button class="btn-outline ${mostrarArquivados?'active':''}" data-action="toggle-mostrar-arquivados" style="display:inline-flex; align-items:center; gap:6px;">${ICON_BAU} ${mostrarArquivados?'Voltar aos ativos':'Ver arquivados'}</button>
        <button class="btn-primary" data-action="open-new-lead">+ Novo lead</button>
      </div>
    </div>

    <div class="leads-toolbar">
      <input type="text" class="leads-search" id="leads-search-input" placeholder="Buscar por nome ou telefone" value="${esc(leadsSearch)}" />
      <select class="leads-filter" id="leads-status-filter">
        <option value="">Todos os status</option>
        ${board.columns.map(c=>`<option value="${c.id}" ${leadsStatusFilter===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
      </select>
      ${renderBotaoOrdenar('leads', leadsOrdenarPor)}
      <button class="btn-outline" data-action="exportar-leads">Exportar</button>
    </div>

    ${leadsSelecionados.size ? `
      <div class="leads-bulk-bar">
        <span>${leadsSelecionados.size} selecionado${leadsSelecionados.size===1?'':'s'}</span>
        <select id="leads-bulk-coluna">
          <option value="">Mover para…</option>
          ${board.columns.map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join('')}
        </select>
        <button class="btn-outline" data-action="leads-bulk-etiqueta">+ Etiqueta</button>
        ${leadsBulkEtiquetaAberta ? `
          <input type="text" id="leads-bulk-etiqueta-input" placeholder="Nome da etiqueta" value="${esc(leadsBulkEtiquetaValor)}" style="width:140px;" autofocus />
          <button class="btn-primary" data-action="leads-bulk-etiqueta-confirmar">Aplicar</button>
        ` : ''}
        <button class="btn-outline" data-action="leads-bulk-arquivar">📦 Arquivar</button>
        <button class="delete-link" data-action="leads-bulk-excluir">🗑 Excluir</button>
        <button class="icon-btn" data-action="leads-bulk-limpar" title="Cancelar seleção" style="margin-left:auto;">✕</button>
      </div>
    ` : ''}

    <div class="leads-table-wrap">
      <table class="leads-table">
        <thead>
          <tr>
            <th style="width:34px;"><span class="check-circle ${todosSelecionados?'checked':''}" data-action="leads-select-all">${todosSelecionados?ICON_CHECK:''}</span></th>
            <th>Nome</th><th>Contato</th><th>Etapa</th><th>Valor</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${leads.length ? leads.map(c=>{
            const col = board.columns.find(k=>k.id===c.columnId);
            const tipo = col ? (TIPOS[col.tipo] || TIPOS.aberto) : TIPOS.aberto;
            const marcado = leadsSelecionados.has(c.id);
            return `
              <tr class="${marcado?'lead-row-selecionada':''}">
                <td><span class="check-circle ${marcado?'checked':''}" data-action="leads-select-um" data-card-id="${c.id}">${marcado?ICON_CHECK:''}</span></td>
                <td class="clickable" data-action="open-edit-card" data-card-id="${c.id}">${c.tipoPessoa==='juridica' ? '🏢 ' : ''}${esc(c.cliente) || 'Sem nome'}</td>
                <td class="clickable" data-action="open-edit-card" data-card-id="${c.id}">${c.telefone ? esc(c.telefone) : '—'}</td>
                <td class="clickable" data-action="open-edit-card" data-card-id="${c.id}"><span class="badge" style="color:${tipo.color};background:${tipo.bg};${tipo.strike?'text-decoration:line-through;':''}">${col ? esc(col.nome) : '—'}</span></td>
                <td class="clickable" data-action="open-edit-card" data-card-id="${c.id}">${fmtBRL(c.valor)}</td>
                <td>
                  <div class="leads-row-actions">
                    ${c.telefone ? `<button class="icon-btn" data-action="open-whatsapp" data-phone="${esc(c.telefone)}" title="WhatsApp">${WA_ICON}</button>` : ''}
                  </div>
                </td>
              </tr>
            `;
          }).join('') : `<tr class="leads-empty-row"><td colspan="6">Nenhum lead encontrado. Cadastre o primeiro no botão "Novo lead".</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

/* ---------- página: Tarefas ---------- */
function closeAgendaDiaModal(){
  agendaDiaSelecionado = null;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
// Redesenha o modal do dia preservando a posição de rolagem da linha do tempo —
// usado depois de ações que não deveriam "pular" a visão de volta pro topo
// (colar, copiar, marcar como concluída).
function renderAgendaDiaModalPreservandoScroll(){
  const timelineEl = document.getElementById('agenda-dia-timeline');
  const scrollAnterior = timelineEl ? timelineEl.scrollTop : null;
  renderAgendaDiaModal();
  if(scrollAnterior!==null){
    const timelineEl2 = document.getElementById('agenda-dia-timeline');
    if(timelineEl2) timelineEl2.scrollTop = scrollAnterior;
  }
}
function renderAgendaDiaModal(){
  const root = document.getElementById('modal-root');
  if(!agendaDiaSelecionado){ root.innerHTML=''; return; }
  const diaISO = agendaDiaSelecionado;
  const { tarefasDoDia, eventosDoDia } = itensDoDiaAgenda(diaISO);
  const dataObj = new Date(diaISO + 'T00:00:00');
  const dataLabel = dataObj.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });

  function horaDaTarefa(t){
    const d = new Date(t.vencimento);
    if(isNaN(d.getTime()) || (d.getUTCHours()===0 && d.getUTCMinutes()===0)) return null;
    return d.getHours();
  }
  function horaDoEvento(e){
    if(e.diaInteiro || !e.inicio) return null;
    const d = new Date(e.inicio);
    return isNaN(d.getTime()) ? null : d.getHours();
  }

  const tarefasSemHora = tarefasDoDia.filter(t=>horaDaTarefa(t)===null);
  const eventosSemHora = eventosDoDia.filter(e=>horaDoEvento(e)===null);
  const porHora = Array.from({length:24}, ()=>({ tarefas:[], eventos:[] }));
  tarefasDoDia.forEach(t=>{ const h=horaDaTarefa(t); if(h!==null) porHora[h].tarefas.push(t); });
  eventosDoDia.forEach(e=>{ const h=horaDoEvento(e); if(h!==null) porHora[h].eventos.push(e); });

  function renderTarefaMini(t){
    return `
      <div class="agenda-dia-item" data-copiar-tarefa="${t.id}">
        <span class="check-circle ${t.concluida?'checked':''}" data-task-toggle="${t.id}">${t.concluida?ICON_CHECK:''}</span>
        <div style="flex:1;">
          <div class="agenda-dia-item-titulo ${t.concluida?'concluida':''}">${esc(t.titulo)}</div>
          ${t.clienteNome ? `<div class="agenda-dia-item-hora">👤 ${esc(t.clienteNome)}</div>` : ''}
        </div>
        <button class="icon-btn" data-task-edit="${t.id}" title="Editar">${ICON_EDIT}</button>
      </div>
    `;
  }
  function renderEventoMini(e){
    return `<div class="agenda-hora-evento" data-copiar-evento="${e.id}" data-editar-evento="${e.id}">📅 ${esc(e.titulo)}${e.clienteNome ? ` <span style="opacity:.7;">· 👤 ${esc(e.clienteNome)}</span>` : ''}</div>`;
  }

  const horaAtual = new Date().getHours();

  root.innerHTML = `
    <div class="overlay" id="agenda-dia-overlay">
      <div class="modal agenda-dia-modal">
        <div class="modal-head">
          <h3 style="text-transform:capitalize;">${esc(dataLabel)}</h3>
          <button id="agenda-dia-close">✕</button>
        </div>
        <div class="modal-body">
          ${tarefaCopiada ? `
            <div class="agenda-clipboard-hint">
              <span>Copiado: <b>${esc(tarefaCopiada.titulo)}</b> — ${modoSelecaoMultipla ? `selecione os horários e clique em "Colar" (${horariosSelecionados.size} marcado${horariosSelecionados.size===1?'':'s'})` : 'clique num horário vazio pra colar aqui'}</span>
              <button class="btn-outline" data-action="toggle-selecao-multipla">${modoSelecaoMultipla ? 'Cancelar seleção' : '☑ Selecionar vários'}</button>
              <button class="icon-btn" data-action="cancelar-tarefa-copiada" title="Cancelar cópia">✕</button>
            </div>
          ` : ''}
          ${(tarefasSemHora.length || eventosSemHora.length) ? `
            <div class="settings-page-subtitle">Sem horário definido</div>
            ${eventosSemHora.map(e=>`
              <div class="agenda-dia-item" data-copiar-evento="${e.id}" data-editar-evento="${e.id}">
                <span class="check-circle ${e.concluida?'checked':''}" data-evento-toggle="${e.id}">${e.concluida?ICON_CHECK:''}</span>
                <div class="agenda-dia-item-titulo" style="flex:1;">${esc(e.titulo)}</div>
              </div>
            `).join('')}
            ${tarefasSemHora.map(renderTarefaMini).join('')}
            <div class="settings-sep-line"></div>
          ` : ''}
          <div class="agenda-dia-timeline" id="agenda-dia-timeline">
            ${porHora.map((conteudo, h)=>{
              const horaStr = `${String(h).padStart(2,'0')}:00`;
              const selecionada = horariosSelecionados.has(horaStr);
              return `
              <div class="agenda-hora-row ${h===horaAtual?'agenda-hora-atual':''} ${tarefaCopiada?'agenda-hora-colavel':''} ${selecionada?'agenda-hora-selecionada':''}" id="agenda-hora-${h}" data-action="nova-tarefa-nesta-hora" data-hora="${horaStr}">
                <span class="agenda-hora-label">${horaStr}</span>
                <div class="agenda-hora-conteudo">
                  ${conteudo.eventos.map(renderEventoMini).join('')}
                  ${conteudo.tarefas.map(t=>`
                    <span class="agenda-hora-tarefa ${t.concluida?'concluida':''}" data-task-edit-hora="${t.id}" data-copiar-tarefa="${t.id}">✓ ${esc(t.titulo)}</span>
                  `).join('')}
                  ${tarefaCopiada ? `<span class="agenda-hora-colar-hint">${modoSelecaoMultipla ? (selecionada?'✓ Selecionado':'+ Selecionar') : '+ Colar aqui'}</span>` : ''}
                </div>
              </div>
            `;}).join('')}
          </div>
        </div>
        <div class="modal-foot">
          ${(tarefasDoDia.length || eventosDoDia.length) ? `<button class="delete-link" id="agenda-dia-excluir-tudo">🗑 Excluir tudo desse dia</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            ${modoSelecaoMultipla
              ? `<button class="btn-save" id="agenda-dia-colar-selecionados" ${horariosSelecionados.size===0?'disabled':''}>📥 Colar em ${horariosSelecionados.size} horário${horariosSelecionados.size===1?'':'s'}</button>`
              : `<button class="btn-save" id="agenda-dia-nova-tarefa">${tarefaCopiada ? 'Colar aqui' : '+ Nova tarefa nesse dia'}</button>`
            }
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('agenda-dia-close').addEventListener('click', closeAgendaDiaModal);
  document.getElementById('agenda-dia-overlay').addEventListener('click', (e)=>{ if(e.target.id==='agenda-dia-overlay') closeAgendaDiaModal(); });
  const excluirTudoBtn = document.getElementById('agenda-dia-excluir-tudo');
  if(excluirTudoBtn) excluirTudoBtn.addEventListener('click', ()=> excluirTudoDoDia(diaISO, tarefasDoDia, eventosDoDia));
  const novaTarefaBtn = document.getElementById('agenda-dia-nova-tarefa');
  if(novaTarefaBtn) novaTarefaBtn.addEventListener('click', ()=>{
    if(tarefaCopiada){ colarTarefaEm(diaISO); return; }
    closeAgendaDiaModal();
    openNewTask(diaISO);
  });
  const toggleSelecaoBtn = root.querySelector('[data-action="toggle-selecao-multipla"]');
  if(toggleSelecaoBtn) toggleSelecaoBtn.addEventListener('click', ()=>{
    modoSelecaoMultipla = !modoSelecaoMultipla;
    horariosSelecionados.clear();
    renderAgendaDiaModal();
  });
  const colarSelecionadosBtn = document.getElementById('agenda-dia-colar-selecionados');
  if(colarSelecionadosBtn) colarSelecionadosBtn.addEventListener('click', colarEmHorariosSelecionados);
  root.querySelectorAll('[data-action="nova-tarefa-nesta-hora"]').forEach(row=>{
    row.addEventListener('click', ()=>{
      const hora = row.dataset.hora;
      if(modoSelecaoMultipla){
        if(horariosSelecionados.has(hora)) horariosSelecionados.delete(hora);
        else horariosSelecionados.add(hora);
        renderAgendaDiaModalPreservandoScroll();
        return;
      }
      if(tarefaCopiada){
        colarTarefaEm(diaISO, hora);
        return;
      }
      closeAgendaDiaModal();
      openNewTask(diaISO, hora);
    });
  });
  root.querySelectorAll('[data-task-edit-hora]').forEach(el=>{
    el.addEventListener('click', (e)=>{
      e.stopPropagation(); // não deixa o clique "vazar" pra linha da hora (que abriria nova tarefa)
      openEditTask(el.dataset.taskEditHora);
    });
  });
  root.querySelectorAll('[data-task-toggle]').forEach(el=>{
    el.addEventListener('click', async (e)=>{
      e.stopPropagation();
      await toggleTaskConcluida(el.dataset.taskToggle);
      renderAgendaDiaModalPreservandoScroll();
    });
  });
  root.querySelectorAll('[data-evento-toggle]').forEach(el=>{
    el.addEventListener('click', async (e)=>{
      e.stopPropagation();
      await toggleEventoConcluido(el.dataset.eventoToggle);
      renderAgendaDiaModalPreservandoScroll();
    });
  });
  root.querySelectorAll('[data-task-edit]').forEach(el=>{
    el.addEventListener('click', ()=>{
      openEditTask(el.dataset.taskEdit);
    });
  });
  ligarGestoDeCopiar(root.querySelectorAll('[data-copiar-tarefa]'), (el)=> copiarTarefa(el.dataset.copiarTarefa, el));
  ligarGestoDeCopiar(root.querySelectorAll('[data-copiar-evento]'), (el)=> copiarEvento(el.dataset.copiarEvento, el));
  root.querySelectorAll('[data-editar-evento]').forEach(el=>{
    el.addEventListener('click', (e)=>{
      e.stopPropagation(); // não deixa o clique vazar pra linha da hora (que abriria nova tarefa em branco)
      openEditEventoGoogle(el.dataset.editarEvento);
    });
  });
  const cancelarCopiaBtn = root.querySelector('[data-action="cancelar-tarefa-copiada"]');
  if(cancelarCopiaBtn) cancelarCopiaBtn.addEventListener('click', cancelarTarefaCopiada);

  // Rola a linha do tempo até perto da hora atual (ou a 1ª hora com algo marcado, se for antes)
  const primeiraComItem = porHora.findIndex(c=>c.tarefas.length||c.eventos.length);
  const horaAlvo = primeiraComItem !== -1 && primeiraComItem < horaAtual ? primeiraComItem : horaAtual;
  const linhaAlvo = document.getElementById(`agenda-hora-${Math.max(0, horaAlvo-1)}`);
  if(linhaAlvo) linhaAlvo.scrollIntoView({ block:'start' });
}

function renderTarefasPage(){
  const abas = [['calendario','Calendário'],['gerot','GEROT']];
  return `
    <div class="page-head">
      <div>
        <h1>Agenda/Tarefas</h1>
        <p>Tarefas do CRM, compromissos do Google Agenda e sua rotina semanal</p>
      </div>
      ${agendaSubTab==='calendario' ? `
        <div class="page-head-actions">
          ${calendarConnected ? `<button class="btn-outline" data-action="sync-calendar-now" ${calendarSyncing?'disabled':''}>${calendarSyncing?'Sincronizando…':'📅 Sincronizar Agenda'}</button>` : ''}
          <button class="btn-primary" data-action="open-new-task">+ Nova tarefa</button>
        </div>
      ` : ''}
    </div>
    <div class="funil-tabs" style="margin-bottom:20px;">
      ${abas.map(([key,label])=>`<button class="tab-btn ${agendaSubTab===key?'active':''}" data-action="set-agenda-subtab" data-subtab="${key}">${label}</button>`).join('')}
    </div>
    ${agendaSubTab==='calendario' ? renderCalendarioConteudo() : renderGerotConteudo()}
  `;
}
const GEROT_DIAS = ['Segunda','Terça','Quarta','Quinta','Sexta'];
const GEROT_HORARIOS = (()=>{ const lista=[]; for(let h=8; h<=19; h++){ lista.push(`${String(h).padStart(2,'0')}:00`); if(h<19) lista.push(`${String(h).padStart(2,'0')}:30`); } return lista; })();
const GEROT_LIMITES = [...GEROT_HORARIOS, '19:30']; // 24 limites (23 horários de início + o fim do último bloco) — usado pra calcular quantas linhas um bloco ocupa

// Monta, pra cada dia, um mapa horário -> { tipo: 'inicio'|'coberto'|'vazio', bloco, rowspan }.
// "inicio" é onde a célula mesclada nasce (rowspan cobre o resto); "coberto" são as
// linhas por baixo dela, que não desenham nada (já fazem parte da célula de cima).
function calcularGradeGerot(){
  const grade = {};
  for(let diaIdx=0; diaIdx<5; diaIdx++){
    grade[diaIdx] = {};
    GEROT_HORARIOS.forEach(h => grade[diaIdx][h] = { tipo:'vazio' });
    gerotBlocos.filter(b=>b.diaSemana===diaIdx).forEach(b=>{
      const idxInicio = GEROT_HORARIOS.indexOf(b.horarioInicio);
      const idxFim = GEROT_LIMITES.indexOf(b.horarioFim);
      if(idxInicio===-1 || idxFim===-1 || idxFim<=idxInicio) return;
      const rowspan = idxFim - idxInicio;
      grade[diaIdx][b.horarioInicio] = { tipo:'inicio', bloco:b, rowspan };
      for(let i=1;i<rowspan;i++) grade[diaIdx][GEROT_HORARIOS[idxInicio+i]] = { tipo:'coberto' };
    });
  }
  return grade;
}
function renderGerotConteudo(){
  const [ano,mes,dia] = gerotSemanaAtual.split('-').map(Number);
  const segunda = new Date(ano, mes-1, dia);
  const datasDaSemana = GEROT_DIAS.map((_,i)=>{ const d = new Date(segunda); d.setDate(d.getDate()+i); return d; });
  const labelSemana = `${datasDaSemana[0].toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} a ${datasDaSemana[4].toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}`;
  const grade = calcularGradeGerot();

  return `
    <div class="settings-page-section" style="margin-bottom:16px;">
      <p class="settings-page-note">Sua rotina semanal — planeje o que fazer em cada horário, de segunda a sexta. Diferente do calendário, isso não é sobre um dia específico: pense nela como um "molde" da sua semana ideal, que você ajusta quando precisar. Clique num horário livre pra criar um bloco (pode escolher até que horas ele vai), ou num bloco já preenchido pra editar.</p>
    </div>
    <div class="month-step-nav" style="margin-bottom:10px;">
      <button class="icon-btn" data-action="gerot-semana" data-delta="-1" title="Semana anterior">‹</button>
      <span>${labelSemana}</span>
      <button class="icon-btn" data-action="gerot-semana" data-delta="1" title="Próxima semana">›</button>
      <button class="btn-outline" data-action="gerot-hoje" style="margin-left:10px;">Essa semana</button>
      <button class="btn-outline" data-action="gerot-copiar-semana" style="margin-left:auto;" ${gerotCopiando?'disabled':''}>${gerotCopiando?'Copiando…':'📋 Copiar semana anterior'}</button>
    </div>
    <div style="display:flex; gap:8px; justify-content:flex-end; margin-bottom:16px;">
      <button class="btn-outline" data-action="gerot-exportar-planilha">⬇️ Exportar planilha</button>
      <input type="file" id="gerot-importar-input" accept=".xlsx,.xls" style="display:none;" />
      <button class="btn-outline" data-action="gerot-importar-planilha" ${gerotImportando?'disabled':''}>${gerotImportando?'Importando…':'⬆️ Importar planilha'}</button>
    </div>
    ${gerotImportMsg ? `<p class="settings-page-msg ${gerotImportMsg.tipo}" style="margin-bottom:14px;">${esc(gerotImportMsg.texto)}</p>` : ''}
    ${!gerotLoaded ? `<p class="settings-page-note">Carregando…</p>` : `
      <div class="gerot-grid-wrap">
        <table class="gerot-tabela">
          <thead>
            <tr>
              <th class="gerot-col-hora"></th>
              ${GEROT_DIAS.map((d,i)=>`<th>${d}<br><span class="gerot-data-cabecalho">${datasDaSemana[i].toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</span></th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${GEROT_HORARIOS.map(horario=>`
              <tr>
                <td class="gerot-col-hora">${horario}</td>
                ${GEROT_DIAS.map((_,diaIdx)=>{
                  const info = grade[diaIdx][horario];
                  if(info.tipo==='coberto') return '';
                  if(info.tipo==='inicio'){
                    const b = info.bloco;
                    return `<td class="gerot-celula gerot-celula-preenchida" rowspan="${info.rowspan}">
                      <button class="gerot-celula-btn" data-action="gerot-abrir-editor" data-dia="${diaIdx}" data-horario="${horario}" data-bloco-id="${b.id}">
                        <span class="gerot-bloco-horario">${b.horarioInicio}–${b.horarioFim}</span>
                        <span class="gerot-bloco-texto">${esc(b.texto)}</span>
                      </button>
                    </td>`;
                  }
                  return `<td class="gerot-celula"><button class="gerot-celula-btn" data-action="gerot-abrir-editor" data-dia="${diaIdx}" data-horario="${horario}"></button></td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${gerotEditor ? renderGerotEditorHtml() : ''}
    `}
  `;
}
function renderCalendarioConteudo(){
  if(!agendaLoaded){
    return `<p class="settings-page-note">Carregando…</p>`;
  }
  const [ano, mesNum] = agendaMesAtual.split('-').map(Number);
  const primeiroDia = new Date(ano, mesNum-1, 1);
  const diasNoMes = new Date(ano, mesNum, 0).getDate();
  const offsetInicio = primeiroDia.getDay(); // 0 = domingo
  const hojeISO = new Date().toISOString().slice(0,10);
  const semData = agendaTarefas.filter(t=>!t.vencimento);

  let celulas = [];
  for(let i=0;i<offsetInicio;i++) celulas.push(null);
  for(let d=1; d<=diasNoMes; d++) celulas.push(d);
  while(celulas.length % 7 !== 0) celulas.push(null);

  return `
    ${tarefaCopiada ? `
      <div class="agenda-clipboard-hint" style="margin-bottom:16px;">
        Copiado: <b>${esc(tarefaCopiada.titulo)}</b> — abra qualquer dia e clique num horário vazio pra colar
        <button class="icon-btn" data-action="cancelar-tarefa-copiada" title="Cancelar cópia">✕</button>
      </div>
    ` : ''}

    <div class="month-step-nav" style="margin-bottom:16px;">
      <button class="icon-btn" data-action="agenda-mes" data-delta="-1" title="Mês anterior">‹</button>
      <span>${monthLabel(agendaMesAtual, true)}</span>
      <button class="icon-btn" data-action="agenda-mes" data-delta="1" title="Próximo mês">›</button>
      <button class="btn-outline" data-action="agenda-hoje" style="margin-left:10px;">Hoje</button>
    </div>

    ${semData.length ? `
      <div class="agenda-sem-data">
        <span class="agenda-sem-data-label">Sem data:</span>
        ${semData.map(t=>`<button class="etiqueta-pill" data-action="open-edit-task" data-task-id="${t.id}">${esc(t.titulo)}</button>`).join('')}
      </div>
    ` : ''}

    <div class="agenda-grid">
      ${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d=>`<div class="agenda-grid-header">${d}</div>`).join('')}
      ${celulas.map(dia=>{
        if(dia===null) return `<div class="agenda-cell agenda-cell-vazia"></div>`;
        const diaISO = `${ano}-${String(mesNum).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        const { tarefasDoDia, eventosDoDia } = itensDoDiaAgenda(diaISO);
        const totalItens = tarefasDoDia.length + eventosDoDia.length;
        const itensPreview = [
          ...eventosDoDia.map(e=>({tipo:'evento', texto: e.diaInteiro ? e.titulo : `${e.titulo}${e.inicio ? ' - '+formatHora(e.inicio) : ''}`})),
          ...tarefasDoDia.map(t=>({tipo:'tarefa', texto: t.titulo, concluida: t.concluida})),
        ].slice(0,3);
        const isHoje = diaISO === hojeISO;
        return `
          <div class="agenda-cell ${isHoje?'agenda-cell-hoje':''} ${totalItens?'tem-itens':''} ${diaISO===agendaDiaDestacado?'agenda-cell-destacada':''}" data-action="abrir-dia-agenda" data-dia="${diaISO}">
            <span class="agenda-cell-numero">${dia}</span>
            ${totalItens ? `
              <div class="agenda-cell-itens">
                ${itensPreview.map(it=>`<div class="agenda-item-mini agenda-item-${it.tipo} ${it.concluida?'concluida':''}">${esc(it.texto)}</div>`).join('')}
                ${totalItens > 3 ? `<div class="agenda-item-mais">+${totalItens-3} mais</div>` : ''}
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* ---------- página: Comissões ---------- */
function renderComissoesPage(){
  if(!contratosLoaded){
    return `<div class="page-head"><div><h1>Comissões</h1><p>Carregando…</p></div></div>`;
  }
  const stats = comissoesStats();
  return `
    <div class="page-head">
      <div>
        <h1>Comissões</h1>
        <p>Previsão de recebimento por mês · ${monthLabel(comissoesMonth, true)}</p>
      </div>
      <div class="page-head-actions">
        <div class="month-step-nav">
          <button class="icon-btn" data-action="comissoes-mes" data-delta="-1" title="Mês anterior">‹</button>
          <span>${monthLabel(comissoesMonth, true)}</span>
          <button class="icon-btn" data-action="comissoes-mes" data-delta="1" title="Próximo mês">›</button>
        </div>
        ${renderBotaoOrdenar('comissoes', comissoesOrdenarPor, null, true)}
        <button class="icon-btn" data-action="open-regras-comissao" title="Regras de comissão">${ICON_SETTINGS}</button>
        <button class="btn-primary" data-action="open-new-contrato">+ Novo contrato</button>
      </div>
    </div>

    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-card-top"><span>Previsto este mês</span></div>
        <div class="metric-value">${fmtBRL(stats.previstoMes)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span>Total ativo a receber</span></div>
        <div class="metric-value">${fmtBRL(stats.totalAtivo)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span>Contratos cadastrados</span></div>
        <div class="metric-value">${stats.total}</div>
      </div>
    </div>

    ${contratos.length ? `
      <div class="contratos-list">
        ${ordenarPorCriterio(contratos, comissoesOrdenarPor, 'desc', null, 'date').map(c=>renderContratoCard(c)).join('')}
      </div>
    ` : `<div class="tasks-empty">Nenhum contrato de comissão cadastrado ainda.</div>`}
  `;
}

function renderContratoCard(c){
  const anchor = (c.date||'').slice(0,7);
  const idx = monthsBetween(anchor, comissoesMonth);
  const idxCancelamento = contratoIdxCancelamento(c);
  const parcelaAtual = Math.min(Math.max(idx+1, 0), c.parcelas, idxCancelamento===Infinity?c.parcelas:idxCancelamento);
  const limiteBarra = Math.min(c.parcelas, idxCancelamento);
  const pct = Math.max(0, Math.min(1, idx / limiteBarra));
  const status = c.canceladoNoMes
    ? `Cancelado a partir de ${monthLabel(c.canceladoNoMes, true)}`
    : (idx >= c.parcelas ? 'Contrato quitado' : idx < 0 ? 'Ainda não iniciado' : `Parcela ${parcelaAtual}/${c.parcelas} este mês`);
  const escopo = ESCOPOS[c.scope] || ESCOPOS.Pessoal;
  // contratos novos guardam o detalhe completo em "blocos" (N linhas, da regra usada);
  // contratos criados antes das regras editáveis não têm isso e caem no formato antigo
  const p2 = c.parcelas - c.parcelas1;
  const blocosHtml = (Array.isArray(c.blocos) && c.blocos.length)
    ? c.blocos.map(b=>`<div>🔹 ${b.parcelas} parcela${b.parcelas===1?'':'s'} de ${fmtBRL(b.value)} cada</div>`).join('')
    : (p2 > 0
      ? `<div>🔹 ${c.parcelas1} parcela${c.parcelas1===1?'':'s'} de ${fmtBRL(c.value)} cada</div><div>🔹 ${p2} parcela${p2===1?'':'s'} de ${fmtBRL(c.value2)} cada</div>`
      : `<div>🔹 ${c.parcelas1} parcela${c.parcelas1===1?'':'s'} de ${fmtBRL(c.value)} cada</div>`);
  return `
    <div class="contrato-card ${c.canceladoNoMes?'contrato-card-cancelado':''}">
      <div class="contrato-card-head">
        <div>
          <h3 class="contrato-card-title">${esc(c.desc)}</h3>
          <p class="contrato-card-note">
            <span class="badge" style="color:${escopo.color};background:${escopo.bg}">${escopo.label}</span>
            <span>· ${c.parcelas}x parcelas · Carta de crédito: ${fmtBRL(c.creditoValor)}</span>
            ${c.geradoAutomaticamente ? `<span class="badge badge-neutral" title="Criada automaticamente quando o cliente entrou numa coluna de fechamento no Pipeline">⚡ Gerada pelo Pipeline</span>` : ''}
            ${c.canceladoNoMes ? `<span class="badge" style="color:var(--danger);background:var(--danger-soft)">Cancelado</span>` : ''}
          </p>
        </div>
        <div class="contrato-card-actions">
          <button class="icon-btn" data-action="${c.canceladoNoMes?'reativar-contrato':'cancelar-contrato'}" data-contrato-id="${c.id}" title="${c.canceladoNoMes?'Reativar comissão':'Marcar como cancelada'}">${c.canceladoNoMes?ICON_REATIVAR:ICON_CANCELAR}</button>
          <button class="icon-btn" data-action="open-edit-contrato" data-contrato-id="${c.id}" title="Editar">${ICON_EDIT}</button>
          <button class="icon-btn" data-action="delete-contrato" data-contrato-id="${c.id}" title="Excluir">${ICON_TRASH}</button>
        </div>
      </div>
      <div class="contrato-card-blocks">
        ${blocosHtml}
        <div class="contrato-card-total">Total líquido da comissão: ${fmtBRL(contratoTotal(c))}</div>
      </div>
      <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${pct*100}%"></div></div>
      <div class="contrato-card-status">
        <span>${status}</span>
        <span>Início: ${monthLabel(anchor, true)}</span>
      </div>
    </div>
  `;
}

/* ---------- página: Configurações ---------- */
const CONFIG_CATEGORIAS = [
  { grupo: 'Conta', itens: [
    ['perfil', 'Seu perfil'],
    ['seguranca', 'Login e segurança'],
    ['aparencia', 'Aparência'],
  ]},
  { grupo: 'Integrações', itens: [
    ['whatsapp', 'WhatsApp Business'],
    ['google-agenda', 'Google Agenda'],
    ['instagram', 'Instagram'],
    ['webhooks', 'Webhooks'],
    ['agendamento', 'Link de agendamento'],
  ]},
  { grupo: 'Dados', itens: [
    ['campos', 'Campos personalizados'],
    ['importar', 'Importar leads'],
  ]},
  { grupo: 'Sistema', itens: [
    ['manutencao', 'Manutenção'],
  ]},
];

function renderConfigPerfil(){
  const temFoto = !!(currentUser && currentUser.avatarUrl);
  return `
    <div class="settings-page-section">
      <h3>Seu perfil</h3>
      <div class="avatar-upload-row">
        <div class="avatar-preview avatar-preview-interativo" id="avatar-preview" title="${temFoto?'Segure pra ver a foto · clique pra trocar':'Clique pra adicionar uma foto'}">
          ${temFoto ? `<img src="${currentUser.avatarUrl}" alt="Foto de perfil" />` : esc(iniciaisDoNome((currentUser&&currentUser.nome)||''))}
          <div class="avatar-hover-overlay">${ICON_CAMERA}</div>
        </div>
        <div>
          <input type="file" id="avatar-input" accept="image/png,image/jpeg,image/webp" style="display:none;" />
          <div class="settings-btn-row">
            <button class="btn-outline" data-action="abrir-editar-perfil" ${avatarSalvando?'disabled':''}>${avatarSalvando?'Enviando…':'Editar perfil'}</button>
            ${temFoto ? `<button class="btn-outline" id="avatar-remover-btn" ${avatarSalvando?'disabled':''}>Remover foto</button>` : ''}
          </div>
          <p class="settings-page-note">Clique na foto pra trocar${temFoto?', ou segure pra ver ela maior':''}.</p>
        </div>
      </div>
      ${avatarMsg ? `<p class="settings-page-msg ${avatarMsg.tipo}">${esc(avatarMsg.texto)}</p>` : ''}
      <div class="settings-page-row"><span>Nome</span><span>${esc((currentUser && currentUser.nome) || '—')}</span></div>
      <div class="settings-page-row"><span>E-mail</span><span>${esc((currentUser && currentUser.email) || '—')}</span></div>

      <div class="settings-sep-line"></div>

      <div class="settings-page-subtitle">Sessões ativas</div>
      <p class="settings-page-note">Desconecte todos os dispositivos onde você está logado — útil se perdeu um aparelho ou compartilhou sua senha. Você vai precisar entrar de novo aqui também.</p>
      ${logoutAllMsg ? `<p class="settings-page-msg ${logoutAllMsg.tipo}">${esc(logoutAllMsg.texto)}</p>` : ''}
      <button class="btn-danger" data-action="desconectar-todos" ${logoutAllEnviando?'disabled':''}>${logoutAllEnviando?'Desconectando…':'Desconectar todos os dispositivos'}</button>
    </div>
  `;
}

function renderConfigSeguranca(){
  return `
    <div class="settings-page-section">
      <h3>Login e segurança</h3>
      <div class="settings-page-row">
        <span>Senha</span>
        <button class="btn-outline" data-action="abrir-alterar-senha">Mudar senha</button>
      </div>

      <div class="settings-sep-line"></div>

      <div class="settings-page-subtitle">Verificação em duas etapas (2FA)</div>
      ${renderSecao2FA()}

      <div class="settings-sep-line"></div>

      <button class="settings-page-row auditoria-toggle" data-action="toggle-auditoria" style="width:100%; border:none; border-bottom:1px solid var(--line); background:none; cursor:pointer; font-family:inherit;">
        <span class="settings-page-subtitle" style="margin:0;">Log de auditoria</span>
        <span class="auditoria-toggle-seta ${auditoriaExpandida?'aberta':''}">▾</span>
      </button>
      ${auditoriaExpandida ? `
        <p class="settings-page-note">Últimos eventos de segurança da sua conta.</p>
        ${!auditoriaCarregada ? `<p class="settings-page-note">Carregando…</p>` : (auditoriaEventos.length ? `
          <div class="historico-lista">
            ${auditoriaEventos.map(e=>`
              <div class="historico-item">
                <span class="historico-item-texto">${esc(e.detalhe || e.acao)}</span>
                <span class="historico-item-data">${formatDateHora(e.createdAt)}</span>
              </div>
            `).join('')}
          </div>
        ` : `<p class="dash-empty">Nenhum evento registrado ainda.</p>`)}
      ` : ''}
    </div>
  `;
}

function renderConfigAparencia(){
  return `
    <div class="settings-page-section">
      <h3>Modo noturno e cor de destaque</h3>
      <label class="settings-toggle-row">
        <span>Modo noturno</span>
        <span class="switch ${getDarkMode()?'on':''}" data-action="toggle-dark-mode">
          <span class="switch-knob"></span>
        </span>
      </label>
      <div class="settings-page-subtitle">Cor de destaque</div>
      <div class="theme-swatches">
        ${ACCENT_PRESETS.map(cor=>`<button class="theme-swatch ${getAccentColor().toLowerCase()===cor.toLowerCase()?'active':''}" data-action="set-accent" data-color="${cor}" style="background:${cor}" title="${cor}"></button>`).join('')}
      </div>
      <label class="theme-custom-label">
        Outra cor
        <input type="color" id="theme-custom-input" value="${getAccentColor()}" />
      </label>
    </div>
  `;
}

function renderConfigWhatsapp(){
  return `
    <div class="settings-page-section">
      <h3>WhatsApp Business API</h3>
      <div class="settings-page-row">
        <span>Status</span>
        <span>${whatsappConnected ? '✓ Conectado' : 'Não conectado'}</span>
      </div>
      ${whatsappConnected ? `
        <p class="settings-page-note">Conversas ficam registradas dentro do card de cada cliente. Pra reconfigurar, desconecte e conecte de novo com os dados atualizados.</p>
        <div class="settings-page-row">
          <span>Agente IA (responde clientes sozinho)</span>
          <span class="switch ${agenteIaAtivo?'on':''}" data-action="toggle-agente-ia" title="${agenteIaAtivo?'Ativado':'Desativado'}"><span class="switch-knob"></span></span>
        </div>
        ${agenteIaAtivo ? `<p class="settings-page-msg erro">⚠️ O agente está respondendo mensagens automaticamente, sem revisão sua. Ele fica em silêncio por 30 min sempre que você responder um cliente manualmente. Desative quando quiser assumir de vez.</p>` : `<p class="settings-page-note">Quando ativado, a IA responde sozinha as mensagens novas do WhatsApp — sem você revisar antes de enviar.</p>`}

        <div class="settings-sep-line"></div>

        <div class="settings-page-row">
          <span>IA proativa (sugestões automáticas)</span>
          <span class="switch ${iaProativaAtiva?'on':''}" data-action="toggle-ia-proativa" title="${iaProativaAtiva?'Ativada':'Desativada'}"><span class="switch-knob"></span></span>
        </div>
        <p class="settings-page-note">Analisa a conversa quando o cliente responde e deixa uma sugestão de mensagem e tarefa prontas no card — nunca envia nada sozinha, é sempre você quem decide usar.</p>

        <button class="btn-outline" data-action="desconectar-whatsapp">Desconectar</button>
      ` : `
        <div class="field">
          <label>Phone Number ID</label>
          <input type="text" id="wa-phone-id" placeholder="Ex: 109xxxxxxxxxxxx" />
        </div>
        <div class="field">
          <label>Access Token</label>
          <input type="password" id="wa-token" placeholder="Token permanente gerado no Meta" />
        </div>
        <div class="field">
          <label>WABA ID (opcional)</label>
          <input type="text" id="wa-waba-id" placeholder="ID da conta comercial do WhatsApp" />
        </div>
        ${whatsappConfigMsg ? `<p class="settings-page-msg ${whatsappConfigMsg.tipo}">${esc(whatsappConfigMsg.texto)}</p>` : ''}
        <button class="btn-primary" data-action="salvar-whatsapp-config" ${whatsappSalvando?'disabled':''}>${whatsappSalvando?'Salvando…':'Conectar'}</button>
      `}
      <p class="settings-page-note">Requer conta comercial no Meta com o produto WhatsApp ativado. Passo a passo completo no README.</p>
    </div>

    <div class="settings-page-section">
      <h3>Menu de triagem (primeiro contato)</h3>
      <p class="settings-page-note">Quando alguém escreve pela primeira vez, manda esse menu automaticamente e move o lead pra coluna certa conforme a resposta (digitando o número da opção).</p>
      <div class="field">
        <label>Mensagem inicial</label>
        <textarea id="mt-mensagem" rows="3" placeholder="Ex: Oi! Sobre o que você quer falar?&#10;1 - Simulação&#10;2 - Já sou cliente&#10;3 - Outro assunto">${esc(menuTriagem.mensagemInicial)}</textarea>
      </div>
      <div class="mt-opcoes-lista">
        ${menuTriagem.opcoes.map((op, idx)=>renderMenuTriagemOpcao(op, idx)).join('')}
      </div>
      <button type="button" class="btn-outline" id="mt-add-opcao">+ Adicionar opção</button>

      <div class="settings-sep-line"></div>

      <div class="settings-page-row">
        <span>Ativar menu de triagem</span>
        <span class="switch ${menuTriagem.ativo?'on':''}" data-action="toggle-menu-triagem"><span class="switch-knob"></span></span>
      </div>
      ${menuTriagem.ativo ? `<p class="settings-page-msg erro">⚠️ O menu é enviado automaticamente pra qualquer contato novo, sem revisão sua.</p>` : ''}
      ${menuTriagemMsg ? `<p class="settings-page-msg ${menuTriagemMsg.tipo}">${esc(menuTriagemMsg.texto)}</p>` : ''}
      <button class="btn-primary" id="mt-salvar" ${menuTriagemSalvando?'disabled':''}>${menuTriagemSalvando?'Salvando…':'Salvar menu'}</button>
    </div>

    <div class="settings-page-section">
      <h3>Templates de mensagem</h3>
      <p class="settings-page-note">Crie modelos e envie pra aprovação da Meta. "Sincronizar" atualiza o status de cada um (aprovado, em análise ou rejeitado).</p>
      <div class="settings-btn-row">
        <button class="btn-outline" data-action="sincronizar-templates" ${templatesSincronizando?'disabled':''}>${templatesSincronizando?'Sincronizando…':'Sincronizar da Meta'}</button>
        <button class="btn-primary" data-action="open-new-template">+ Novo template</button>
      </div>
      ${templatesMsg ? `<p class="settings-page-msg ${templatesMsg.tipo}">${esc(templatesMsg.texto)}</p>` : ''}
      ${!templatesCarregados ? `<p class="settings-page-note">Carregando…</p>` : (templatesList.length ? `
        <div class="templates-list">
          ${templatesList.map(t=>`
            <div class="template-item">
              <span class="template-item-nome">${esc(t.nome)}</span>
              <span class="template-item-status template-status-${(t.status||'').toLowerCase()}">${statusTemplateLabel(t.status)}</span>
            </div>
          `).join('')}
        </div>
      ` : `<p class="dash-empty">Nenhum template ainda. Crie o primeiro pra começar.</p>`)}
    </div>
  `;
}

function renderConfigGoogleAgenda(){
  return `
    <div class="settings-page-section">
      <h3>Google Agenda</h3>
      <div class="settings-page-row">
        <span>Status</span>
        <span>${calendarConnected ? '✓ Conectada' : 'Não conectada'}</span>
      </div>
      ${calendarConnected
        ? `
          <div class="settings-btn-row">
            <button class="btn-outline" data-action="sync-calendar-now" ${calendarSyncing?'disabled':''}>${calendarSyncing?'Sincronizando…':'Sincronizar agora'}</button>
            <button class="btn-outline" data-action="disconnect-calendar">Desconectar</button>
          </div>
        `
        : (integracoesConfig.googleAgenda
          ? `<button class="btn-primary" data-action="connect-calendar">Conectar Google Agenda</button>`
          : `<p class="settings-page-note">Essa integração não está configurada neste servidor — use o link de agenda abaixo como alternativa (funciona com Google, Apple, Outlook e outros).</p>`)
      }
      <p class="settings-page-note">O botão do WhatsApp de abrir conversa já funciona em todos os clientes com telefone cadastrado, sem precisar conectar nada.</p>
    </div>
    <div class="settings-page-section">
      <h3>Agenda por link (.ics)</h3>
      <p class="settings-page-note">Gera um link que qualquer app de calendário (Google, Apple, Outlook…) pode "assinar" pra ver suas tarefas automaticamente — sem precisar conectar conta nenhuma. É a alternativa que não depende de nenhuma configuração especial deste servidor.</p>
      ${icsCarregando ? `<p class="settings-page-note">Carregando…</p>` : (icsStatus && icsStatus.ativo ? `
        <div class="field">
          <label>Seu link de agenda</label>
          <input type="text" id="ics-url" value="${esc(icsStatus.url)}" readonly onclick="this.select()" />
        </div>
        <div class="settings-btn-row">
          <button class="btn-outline" data-action="copiar-link-ics">Copiar link</button>
          <button class="btn-outline" data-action="gerar-link-ics" ${icsGerando?'disabled':''}>${icsGerando?'Gerando…':'Gerar novo link'}</button>
          <button class="btn-outline" data-action="revogar-link-ics">Revogar</button>
        </div>
      ` : `<button class="btn-primary" data-action="gerar-link-ics" ${icsGerando?'disabled':''}>${icsGerando?'Gerando…':'Gerar link de agenda'}</button>`)}
    </div>
  `;
}

function renderConfigInstagram(){
  return `
    <div class="settings-page-section">
      <h3>Instagram (captação de leads)</h3>
      <div class="settings-page-row">
        <span>Status</span>
        <span>${instagramConnected ? '✓ Conectado' : 'Não conectado'}</span>
      </div>
      ${instagramConnected ? `
        <p class="settings-page-note">Formulário de anúncio preenchido = lead novo automático. Mensagens diretas (DM) também chegam direto na aba Conversas, junto com as do WhatsApp.</p>
        <button class="btn-outline" data-action="desconectar-instagram">Desconectar</button>
      ` : `
        <div class="field">
          <label>Page ID</label>
          <input type="text" id="ig-page-id" placeholder="ID da sua Página do Facebook" />
        </div>
        <div class="field">
          <label>Access Token da página</label>
          <input type="password" id="ig-page-token" placeholder="Token com permissão leads_retrieval e instagram_manage_messages" />
        </div>
        <div class="field">
          <label>ID da conta comercial do Instagram (opcional, pra receber DMs)</label>
          <input type="text" id="ig-business-id" placeholder="ID da conta profissional do Instagram vinculada" />
        </div>
        ${instagramConfigMsg ? `<p class="settings-page-msg ${instagramConfigMsg.tipo}">${esc(instagramConfigMsg.texto)}</p>` : ''}
        <button class="btn-primary" data-action="salvar-instagram-config" ${instagramSalvando?'disabled':''}>${instagramSalvando?'Salvando…':'Conectar'}</button>
      `}
      <p class="settings-page-note">Requer o produto Marketing API no mesmo App do Meta usado no WhatsApp, com sua Página (e Instagram profissional vinculado) conectados. Passo a passo completo no README.</p>
    </div>
  `;
}

function renderConfigWebhooks(){
  return `
    <div class="settings-page-section">
      <h3>Webhooks (Zapier, Make, n8n...)</h3>
      <p class="settings-page-note">Conecte o painel com qualquer outra ferramenta que aceite receber um POST — Zapier ("Webhooks by Zapier"), Make, n8n, ou o que você já usa. Toda vez que o evento escolhido acontecer, mandamos os dados pra sua URL.</p>
      ${webhooksSaidaMsg ? `<p class="settings-page-msg ${webhooksSaidaMsg.tipo}">${esc(webhooksSaidaMsg.texto)}</p>` : ''}
      <div class="disparo-lista-leads" style="max-height:none; margin-bottom:12px;">
        ${webhooksSaida.length ? webhooksSaida.map(w=>`
          <div class="disparo-lead-item" style="cursor:default; flex-direction:column; align-items:stretch; gap:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span><b>${esc(w.nome||'Sem nome')}</b> ${!w.ativo?'<span class="settings-page-note">(pausado)</span>':''}</span>
              <div class="settings-btn-row">
                <button class="btn-outline" data-action="testar-webhook-saida" data-webhook-id="${w.id}">Testar</button>
                <button class="btn-outline" data-action="toggle-webhook-saida" data-webhook-id="${w.id}" data-ativo="${w.ativo?'0':'1'}">${w.ativo?'Pausar':'Ativar'}</button>
                <button class="delete-link" data-action="excluir-webhook-saida" data-webhook-id="${w.id}">🗑</button>
              </div>
            </div>
            <span class="settings-page-note" style="word-break:break-all;">${esc(w.url)}</span>
            <span class="settings-page-note">Eventos: ${w.eventos.map(ev=>ROTULOS_EVENTOS_WEBHOOK[ev]||ev).join(', ')}${w.ultimoEnvioEm?` · Último disparo: ${formatDateHora(w.ultimoEnvioEm)} (${w.ultimoEnvioStatus==='ok'?'✅':'⚠️'})`:''}</span>
          </div>
        `).join('') : '<p class="dash-empty">Nenhum webhook cadastrado ainda.</p>'}
      </div>
      <div class="field">
        <label>Nome (só pra identificar)</label>
        <input type="text" id="novo-webhook-nome" placeholder="Ex: Zapier - novo lead" />
      </div>
      <div class="field">
        <label>URL de destino</label>
        <input type="text" id="novo-webhook-url" placeholder="https://hooks.zapier.com/..." />
      </div>
      <div class="field">
        <label>Quando disparar</label>
        <div class="checkbox-group">
          ${Object.entries(ROTULOS_EVENTOS_WEBHOOK).map(([key,label])=>`
            <label class="checkbox-item"><input type="checkbox" class="novo-webhook-evento" value="${key}" /> ${label}</label>
          `).join('')}
        </div>
      </div>
      <button class="btn-outline" data-action="criar-webhook-saida">+ Adicionar webhook</button>
    </div>
  `;
}

function renderConfigAgendamento(){
  return `
    <div class="settings-page-section">
      <h3>Link de agendamento</h3>
      <p class="settings-page-note">Um link público onde o cliente escolhe um horário livre e marca sozinho — sem precisar trocar mensagem pra combinar dia e hora. Confere disponibilidade nas suas tarefas e, se conectado, no seu Google Agenda também.</p>
      ${agendamentoPublicoMsg ? `<p class="settings-page-msg ${agendamentoPublicoMsg.tipo}">${esc(agendamentoPublicoMsg.texto)}</p>` : ''}
      <div class="settings-page-row">
        <span>Ativar link de agendamento</span>
        <span class="switch ${agendamentoPublicoForm.ativo?'on':''}" data-action="toggle-agendamento-publico-ativo"><span class="switch-knob"></span></span>
      </div>
      ${agendamentoPublicoForm.ativo ? `
        <div class="settings-page-row">
          <span>Seu link</span>
          <span style="display:flex; gap:8px; align-items:center;">
            <span class="settings-page-note" style="font-family:'IBM Plex Mono',monospace;">${window.location.origin}/agendar/${currentUser.id}</span>
            <button class="btn-outline" data-action="copiar-link-agendamento">Copiar</button>
          </span>
        </div>
      ` : ''}
      <div class="field-row" style="margin-top:12px;">
        <div class="field"><label>Início do expediente</label><input type="time" id="ap-hora-inicio" value="${agendamentoPublicoForm.horaInicio}" /></div>
        <div class="field"><label>Fim do expediente</label><input type="time" id="ap-hora-fim" value="${agendamentoPublicoForm.horaFim}" /></div>
        <div class="field">
          <label>Duração de cada horário</label>
          <select id="ap-duracao">
            ${[15,30,45,60].map(min=>`<option value="${min}" ${agendamentoPublicoForm.duracaoMinutos===min?'selected':''}>${min} min</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label>Dias da semana</label>
        <div class="checkbox-group" style="flex-direction:row; flex-wrap:wrap; gap:12px;">
          ${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((label,i)=>`
            <label class="checkbox-item"><input type="checkbox" class="ap-dia-semana" value="${i}" ${agendamentoPublicoForm.diasSemana.includes(i)?'checked':''}/> ${label}</label>
          `).join('')}
        </div>
      </div>
      <div class="field">
        <label>Cliente novo entra em qual coluna do funil?</label>
        <select id="ap-coluna-destino">
          <option value="">Não criar cliente novo automaticamente</option>
          ${board.columns.map(c=>`<option value="${c.id}" ${agendamentoPublicoForm.colunaDestinoId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
        </select>
      </div>
      <button class="btn-outline" data-action="salvar-agendamento-publico">Salvar</button>
    </div>
  `;
}

function renderConfigCampos(){
  return `
    <div class="settings-page-section">
      <h3>Campos personalizados</h3>
      <p class="settings-page-note">Campos extras que aparecem no modal de cada cliente (ex: CPF, data de nascimento).</p>
      ${!camposPersonalizadosCarregados ? `<p class="settings-page-note">Carregando…</p>` : (camposPersonalizados.length ? `
        <div class="campos-lista">
          ${camposPersonalizados.map(c=>`
            <div class="campo-item">
              <span>${esc(c.nome)} <span class="settings-page-note">(${c.tipo})</span></span>
              <button class="icon-btn" data-action="excluir-campo-personalizado" data-campo-id="${c.id}" title="Excluir">${ICON_TRASH}</button>
            </div>
          `).join('')}
        </div>
      ` : `<p class="dash-empty">Nenhum campo personalizado ainda.</p>`)}
      <div class="field-row" style="margin-top:12px;">
        <div class="field"><label>Nome do campo</label><input type="text" id="novo-campo-nome" value="${esc(novoCampoNome)}" placeholder="Ex: CPF" /></div>
        <div class="field">
          <label>Tipo</label>
          <select id="novo-campo-tipo">
            <option value="texto" ${novoCampoTipo==='texto'?'selected':''}>Texto</option>
            <option value="numero" ${novoCampoTipo==='numero'?'selected':''}>Número</option>
            <option value="data" ${novoCampoTipo==='data'?'selected':''}>Data</option>
          </select>
        </div>
      </div>
      ${camposPersonalizadosMsg ? `<p class="settings-page-msg ${camposPersonalizadosMsg.tipo}">${esc(camposPersonalizadosMsg.texto)}</p>` : ''}
      <button class="btn-outline" data-action="criar-campo-personalizado">+ Adicionar campo</button>
    </div>
  `;
}

function renderConfigImportar(){
  return `
    <div class="settings-page-section">
      <h3>Importar leads</h3>
      <p class="settings-page-note">Envie um arquivo CSV com as colunas <b>Nome, Telefone, Valor</b> (nessa ordem, cabeçalho na primeira linha).</p>
      <div class="field">
        <label>Coluna de destino</label>
        <select id="import-coluna">
          ${board.columns.map(c=>`<option value="${c.id}" ${importColumnId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Arquivo CSV</label>
        <input type="file" id="import-arquivo" accept=".csv,text/csv" />
      </div>
      ${importResultado ? `<p class="settings-page-msg ok">${importResultado.sucesso} lead(s) importado(s)${importResultado.falha ? `, ${importResultado.falha} falharam` : ''}.</p>` : ''}
      <button class="btn-primary" id="import-btn" ${importando?'disabled':''}>${importando?'Importando…':'Importar'}</button>
    </div>
  `;
}

function renderConfigManutencao(){
  return `
    <div class="settings-page-section">
      <h3>Backup dos seus dados</h3>
      <p class="settings-page-note">Guarda ou restaura uma cópia de todos os seus clientes, tarefas, comissões, mensagens e configurações.</p>
      <button class="btn-outline" data-action="abrir-backup-modal">📦 Backup</button>
    </div>
    <div class="settings-page-section">
      <h3>Início de contato nos leads antigos</h3>
      <p class="settings-page-note">Preenche automaticamente o "mês de início de contato" dos seus leads que ainda não têm esse campo, usando o mês de venda que já estava cadastrado como ponto de partida. Não altera leads que você já preencheu manualmente, e pode ser usado quantas vezes quiser.</p>
      ${mesInicioContatoMsg ? `<p class="settings-page-msg ${mesInicioContatoMsg.tipo}">${esc(mesInicioContatoMsg.texto)}</p>` : ''}
      <button class="btn-outline" data-action="preencher-mes-inicio-contato" ${preenchendoMesInicioContato?'disabled':''}>${preenchendoMesInicioContato?'Preenchendo…':'Preencher automaticamente'}</button>
    </div>
    <div class="settings-page-section">
      <h3>Atualizações</h3>
      <p class="settings-page-note">Se o painel parecer desatualizado (algo que já mudou e não aparece), use esse botão pra forçar buscar a versão mais nova — principalmente útil no app instalado no celular.</p>
      ${atualizacaoMsg ? `<p class="settings-page-msg ${atualizacaoMsg.tipo}">${esc(atualizacaoMsg.texto)}</p>` : ''}
      <button class="btn-outline" data-action="verificar-atualizacao" ${verificandoAtualizacao?'disabled':''}>${verificandoAtualizacao?'Verificando…':'Verificar atualizações'}</button>
    </div>
  `;
}

function renderConfiguracoesPage(){
  const CONTEUDO_CATEGORIA = {
    'perfil': renderConfigPerfil,
    'seguranca': renderConfigSeguranca,
    'aparencia': renderConfigAparencia,
    'whatsapp': renderConfigWhatsapp,
    'google-agenda': renderConfigGoogleAgenda,
    'instagram': renderConfigInstagram,
    'webhooks': renderConfigWebhooks,
    'agendamento': renderConfigAgendamento,
    'campos': renderConfigCampos,
    'importar': renderConfigImportar,
    'manutencao': renderConfigManutencao,
  };
  const renderFn = CONTEUDO_CATEGORIA[configCategoriaAtiva] || renderConfigPerfil;
  return `
    <div class="page-head">
      <div>
        <h1>Configurações</h1>
        <p>Sua conta, integrações e dados</p>
      </div>
    </div>

    <div class="config-layout">
      <div class="config-sidebar">
        ${CONFIG_CATEGORIAS.map(g=>`
          <div class="config-sidebar-grupo">${g.grupo}</div>
          ${g.itens.map(([key,label])=>`<button class="config-sidebar-item ${configCategoriaAtiva===key?'active':''}" data-action="set-config-categoria" data-categoria="${key}">${label}</button>`).join('')}
        `).join('')}
      </div>
      <div class="config-content">
        ${renderFn()}
      </div>
    </div>
  `;
}

/* ---------- eventos ---------- */
function bindAppEvents(){
  const app = document.getElementById('app');

  const hamburgerBtn = app.querySelector('[data-action="toggle-sidebar"]');
  if(hamburgerBtn) hamburgerBtn.addEventListener('click', ()=>{ sidebarOpen = !sidebarOpen; renderApp(); });
  const closeSidebarEl = app.querySelector('[data-action="close-sidebar"]');
  if(closeSidebarEl) closeSidebarEl.addEventListener('click', ()=>{ sidebarOpen = false; renderApp(); });
  const buscaGlobalBtn = app.querySelector('[data-action="abrir-busca-global"]');
  if(buscaGlobalBtn) buscaGlobalBtn.addEventListener('click', abrirBuscaGlobal);
  const notifBtn = app.querySelector('[data-action="toggle-notif"]');
  if(notifBtn) notifBtn.addEventListener('click', (e)=>{ e.stopPropagation(); notifOpen = !notifOpen; renderApp(); });

  const errorBanner = app.querySelector('[data-action="dismiss-error"]');
  if(errorBanner) errorBanner.addEventListener('click', ()=>{ errorMsg=null; renderApp(); });

  const logoutBtn = app.querySelector('[data-action="logout"]');
  if(logoutBtn) logoutBtn.addEventListener('click', logout);

  const reordenarNavBtn = app.querySelector('[data-action="abrir-reordenar-nav"]');
  if(reordenarNavBtn) reordenarNavBtn.addEventListener('click', abrirReordenarNav);

  app.querySelectorAll('[data-action="nav"]').forEach(btn=>{
    btn.addEventListener('click', ()=> goToPage(btn.dataset.page));
  });

  const darkModeSwitch = app.querySelector('[data-action="toggle-dark-mode"]');
  if(darkModeSwitch) darkModeSwitch.addEventListener('click', ()=>{
    setDarkMode(!getDarkMode());
    renderApp();
  });
  const verificarAtualizacaoBtn = app.querySelector('[data-action="verificar-atualizacao"]');
  if(verificarAtualizacaoBtn) verificarAtualizacaoBtn.addEventListener('click', verificarAtualizacaoApp);
  const preencherMesInicioBtn = app.querySelector('[data-action="preencher-mes-inicio-contato"]');
  if(preencherMesInicioBtn) preencherMesInicioBtn.addEventListener('click', preencherMesInicioContatoAntigos);
  app.querySelectorAll('[data-action="ver-dashboard-membro"]').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirDashboardDeMembro(btn.dataset.userId, btn.dataset.nome));
  });
  const sairDashboardBtn = app.querySelector('[data-action="sair-dashboard-membro"]');
  if(sairDashboardBtn) sairDashboardBtn.addEventListener('click', sairDashboardDeMembro);
  const abrirBackupModalBtn = app.querySelector('[data-action="abrir-backup-modal"]');
  if(abrirBackupModalBtn) abrirBackupModalBtn.addEventListener('click', abrirBackupModal);

  /* -- Conversas (3 colunas) -- */
  const conversasBuscaInput = document.getElementById('conversas-busca-input');
  if(conversasBuscaInput) conversasBuscaInput.addEventListener('input', (e)=>{ conversaBusca = e.target.value; renderApp(); });
  app.querySelectorAll('[data-action="abrir-overlay-conversas"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      conversasOverlay = btn.dataset.overlay;
      if(conversasOverlay==='automacoes' && !automacoesLoaded) loadAutomacoes();
      if(conversasOverlay==='agendamentos' && !agendamentosLoaded) loadAgendamentos();
      renderApp();
    });
  });
  app.querySelectorAll('[data-action="fechar-overlay-conversas"]').forEach(el=>{
    el.addEventListener('click', ()=>{ conversasOverlay = null; renderApp(); });
  });
  app.querySelectorAll('[data-action="selecionar-conversa"]').forEach(el=>{
    el.addEventListener('click', ()=> selecionarConversa(el.dataset.cardId));
  });
  const conversasNovaMsgInput = document.getElementById('conversas-nova-msg');
  if(conversasNovaMsgInput){
    conversasNovaMsgInput.addEventListener('input', (e)=> conversaTexto = e.target.value);
    conversasNovaMsgInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') enviarMensagemConversa(); });
  }
  const conversasEnviarBtn = document.getElementById('conversas-enviar-btn');
  if(conversasEnviarBtn) conversasEnviarBtn.addEventListener('click', enviarMensagemConversa);
  const conversasChatLista = document.getElementById('conversas-chat-lista');
  if(conversasChatLista) conversasChatLista.scrollTop = conversasChatLista.scrollHeight;

  const cvDetNome = document.getElementById('cv-det-nome');
  if(cvDetNome) cvDetNome.addEventListener('blur', (e)=> salvarCampoClienteConversa('cliente', e.target.value));
  const cvDetTelefone = document.getElementById('cv-det-telefone');
  if(cvDetTelefone) cvDetTelefone.addEventListener('blur', (e)=> salvarCampoClienteConversa('telefone', e.target.value));
  const cvDetValor = document.getElementById('cv-det-valor');
  if(cvDetValor){
    cvDetValor.addEventListener('input', (e)=>{
      const { texto } = maskInteiro(e.target.value);
      e.target.value = texto;
    });
    cvDetValor.addEventListener('blur', (e)=>{
      const { numero } = maskInteiro(e.target.value);
      salvarCampoClienteConversa('valor', numero);
    });
  }
  const cvDetTemp = document.getElementById('cv-det-temp');
  if(cvDetTemp) cvDetTemp.addEventListener('change', (e)=> salvarCampoClienteConversa('temperatura', e.target.value));

  app.querySelectorAll('[data-action="executar-automacao-manual"]').forEach(btn=>{
    btn.addEventListener('click', ()=> executarAutomacaoManual(btn.dataset.automacaoId));
  });
  app.querySelectorAll('[data-action="editar-automacao-conversa"]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEditAutomacao(btn.dataset.automacaoId));
  });
  const novaAutomacaoConversaBtn = app.querySelector('[data-action="open-new-automacao-conversa"]');
  if(novaAutomacaoConversaBtn) novaAutomacaoConversaBtn.addEventListener('click', ()=>{
    const card = board.cards.find(c=>c.id===conversaSelecionadaCardId);
    openNewAutomacao(card ? card.columnId : null);
  });

  app.querySelectorAll('[data-action="set-accent"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      setAccentColor(btn.dataset.color);
      renderApp();
    });
  });
  const themeCustomInput = document.getElementById('theme-custom-input');
  if(themeCustomInput) themeCustomInput.addEventListener('input', (e)=> setAccentColor(e.target.value));

  const connectCalBtn = app.querySelector('[data-action="connect-calendar"]');
  if(connectCalBtn) connectCalBtn.addEventListener('click', connectGoogleCalendar);
  const disconnectCalBtn = app.querySelector('[data-action="disconnect-calendar"]');
  if(disconnectCalBtn) disconnectCalBtn.addEventListener('click', disconnectGoogleCalendar);
  app.querySelectorAll('[data-action="sync-calendar-now"]').forEach(btn=>{
    btn.addEventListener('click', syncCalendarNow);
  });
  const gerarIcsBtn = app.querySelector('[data-action="gerar-link-ics"]');
  if(gerarIcsBtn) gerarIcsBtn.addEventListener('click', gerarLinkIcs);
  const revogarIcsBtn = app.querySelector('[data-action="revogar-link-ics"]');
  if(revogarIcsBtn) revogarIcsBtn.addEventListener('click', revogarLinkIcs);
  const copiarIcsBtn = app.querySelector('[data-action="copiar-link-ics"]');
  if(copiarIcsBtn) copiarIcsBtn.addEventListener('click', ()=>{
    const input = document.getElementById('ics-url');
    if(!input) return;
    input.select();
    navigator.clipboard && navigator.clipboard.writeText(input.value).catch(()=>{
      document.execCommand('copy');
    });
  });

  /* -- Dashboard -- */
  app.querySelectorAll('[data-action="set-dash-period"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ dashboardPeriod = btn.dataset.period; renderApp(); });
  });
  const gerarInsightsBtn = app.querySelector('[data-action="gerar-insights"]');
  if(gerarInsightsBtn) gerarInsightsBtn.addEventListener('click', gerarInsightsIA);
  const toggleInsightsPipelineBtn = app.querySelector('[data-action="toggle-insights-pipeline"]');
  if(toggleInsightsPipelineBtn) toggleInsightsPipelineBtn.addEventListener('click', ()=>{ insightsPipelineExpandido = !insightsPipelineExpandido; renderApp(); });
  const editarMetaBtn = app.querySelector('[data-action="editar-meta-vendas"]');
  if(editarMetaBtn) editarMetaBtn.addEventListener('click', ()=>{ editandoMetaVendas = true; renderApp(); });
  const salvarMetaBtn = document.getElementById('meta-vendas-salvar');
  if(salvarMetaBtn) salvarMetaBtn.addEventListener('click', salvarMetaVendas);
  const editarMetaEquipeBtn = app.querySelector('[data-action="editar-meta-vendas-equipe"]');
  if(editarMetaEquipeBtn) editarMetaEquipeBtn.addEventListener('click', ()=>{ editandoMetaVendasEquipe = true; renderApp(); });
  const salvarMetaEquipeBtn = document.getElementById('meta-vendas-equipe-salvar');
  if(salvarMetaEquipeBtn) salvarMetaEquipeBtn.addEventListener('click', salvarMetaVendasEquipe);
  app.querySelectorAll('[data-action="toggle-painel-dashboard"]').forEach(btn=>{
    btn.addEventListener('click', ()=> alternarPainelDashboard(btn.dataset.painelId, btn));
  });

  /* -- tarefas (usado no Dashboard e na página Tarefas) -- */
  app.querySelectorAll('[data-action="toggle-task"]').forEach(el=>{
    el.addEventListener('click', ()=> toggleTaskConcluida(el.dataset.taskId));
  });
  app.querySelectorAll('[data-action="toggle-evento"]').forEach(el=>{
    el.addEventListener('click', ()=> toggleEventoConcluido(el.dataset.eventoId));
  });
  const openNewTaskBtn = app.querySelector('[data-action="open-new-task"]');
  if(openNewTaskBtn) openNewTaskBtn.addEventListener('click', ()=> openNewTask());
  app.querySelectorAll('[data-action="open-edit-task"]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEditTask(btn.dataset.taskId));
  });
  app.querySelectorAll('[data-action="delete-task"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.taskId;
      showConfirm({
        message: 'Excluir esta tarefa? Essa ação não pode ser desfeita.',
        onConfirm: ()=>{ deleteTaskById(id); closeConfirm(); closeTaskModal(); },
      });
    });
  });
  const toggleConcluidasEl = app.querySelector('[data-action="toggle-show-concluidas"]');
  if(toggleConcluidasEl) toggleConcluidasEl.addEventListener('click', ()=>{ tarefasShowConcluidas = !tarefasShowConcluidas; renderApp(); });

  /* -- Agenda (calendário) -- */
  app.querySelectorAll('[data-action="agenda-mes"]').forEach(btn=>{
    btn.addEventListener('click', ()=> mudarMesAgenda(parseInt(btn.dataset.delta,10)));
  });
  app.querySelectorAll('[data-action="set-agenda-subtab"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      agendaSubTab = btn.dataset.subtab;
      if(agendaSubTab==='gerot' && !gerotLoaded) loadGerot(gerotSemanaAtual);
      renderApp();
    });
  });
  app.querySelectorAll('[data-action="gerot-semana"]').forEach(btn=>{
    btn.addEventListener('click', ()=> mudarSemanaGerot(parseInt(btn.dataset.delta,10)));
  });
  const gerotHojeBtn = app.querySelector('[data-action="gerot-hoje"]');
  if(gerotHojeBtn) gerotHojeBtn.addEventListener('click', ()=>{
    gerotSemanaAtual = inicioDaSemana(new Date());
    loadGerot(gerotSemanaAtual);
  });
  const gerotCopiarBtn = app.querySelector('[data-action="gerot-copiar-semana"]');
  if(gerotCopiarBtn) gerotCopiarBtn.addEventListener('click', copiarSemanaAnteriorGerot);
  const gerotExportarBtn = app.querySelector('[data-action="gerot-exportar-planilha"]');
  if(gerotExportarBtn) gerotExportarBtn.addEventListener('click', exportarGerotParaPlanilha);
  const gerotImportarBtn = app.querySelector('[data-action="gerot-importar-planilha"]');
  const gerotImportarInput = document.getElementById('gerot-importar-input');
  if(gerotImportarBtn && gerotImportarInput) gerotImportarBtn.addEventListener('click', ()=> gerotImportarInput.click());
  if(gerotImportarInput) gerotImportarInput.addEventListener('change', (e)=>{
    const file = e.target.files && e.target.files[0];
    if(file) importarGerotDePlanilha(file);
    e.target.value = ''; // permite selecionar o mesmo arquivo de novo depois, se precisar
  });
  app.querySelectorAll('[data-action="gerot-abrir-editor"]').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirGerotEditor(Number(btn.dataset.dia), btn.dataset.horario, btn.dataset.blocoId || null));
  });
  const gerotEditorInicio = document.getElementById('gerot-editor-inicio');
  if(gerotEditorInicio) gerotEditorInicio.addEventListener('change', (e)=>{
    gerotEditor.horarioInicio = e.target.value;
    if(gerotEditor.horarioFim <= gerotEditor.horarioInicio){
      const idx = GEROT_HORARIOS.indexOf(gerotEditor.horarioInicio);
      gerotEditor.horarioFim = GEROT_LIMITES[idx+1] || GEROT_LIMITES[GEROT_LIMITES.length-1];
    }
    renderApp();
  });
  const gerotEditorFim = document.getElementById('gerot-editor-fim');
  if(gerotEditorFim) gerotEditorFim.addEventListener('change', (e)=> gerotEditor.horarioFim = e.target.value);
  const gerotEditorTexto = document.getElementById('gerot-editor-texto');
  if(gerotEditorTexto){
    gerotEditorTexto.addEventListener('input', (e)=> gerotEditor.texto = e.target.value);
    gerotEditorTexto.addEventListener('keydown', (e)=>{ if(e.key==='Enter') salvarGerotEditor(); });
  }
  const gerotEditorSalvar = document.getElementById('gerot-editor-salvar');
  if(gerotEditorSalvar) gerotEditorSalvar.addEventListener('click', salvarGerotEditor);
  const gerotEditorCancelar = document.getElementById('gerot-editor-cancelar');
  if(gerotEditorCancelar) gerotEditorCancelar.addEventListener('click', fecharGerotEditor);
  const gerotEditorApagar = document.getElementById('gerot-editor-apagar');
  if(gerotEditorApagar) gerotEditorApagar.addEventListener('click', apagarGerotEditorAtual);
  const cancelarCopiaPrincipalBtn = app.querySelector('[data-action="cancelar-tarefa-copiada"]');
  if(cancelarCopiaPrincipalBtn) cancelarCopiaPrincipalBtn.addEventListener('click', cancelarTarefaCopiada);
  const agendaHojeBtn = app.querySelector('[data-action="agenda-hoje"]');
  if(agendaHojeBtn) agendaHojeBtn.addEventListener('click', ()=>{
    agendaMesAtual = currentMonthKey();
    loadAgendaMes(agendaMesAtual);
  });
  app.querySelectorAll('[data-action="abrir-dia-agenda"]').forEach(cel=>{
    cel.addEventListener('click', ()=>{
      if(longPressDisparou){ longPressDisparou = false; return; } // ignora o clique fantasma que o toque dispara depois de segurar
      const diaISO = cel.dataset.dia;
      if(diaAgendaCopiado && diaISO !== diaAgendaCopiado.origemISO){
        colarDiaInteiroEm(diaISO, cel);
        if(navigator.vibrate) navigator.vibrate(15);
        return;
      }
      agendaDiaSelecionado = diaISO; renderAgendaDiaModal();
    });
    cel.addEventListener('contextmenu', (e)=>{
      e.preventDefault();
      abrirMenuDia(cel.dataset.dia, e.clientX, e.clientY);
    });
    cel.addEventListener('touchstart', (e)=>{
      const touch = e.touches[0];
      const x = touch.clientX, y = touch.clientY;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(()=>{
        longPressDisparou = true;
        cel.classList.remove('agenda-cell-pressionando');
        if(navigator.vibrate) navigator.vibrate(15);
        abrirMenuDia(cel.dataset.dia, x, y);
      }, 550);
      cel.classList.add('agenda-cell-pressionando');
    }, { passive:true });
    cel.addEventListener('touchend', ()=>{ clearTimeout(longPressTimer); cel.classList.remove('agenda-cell-pressionando'); });
    cel.addEventListener('touchmove', ()=>{ clearTimeout(longPressTimer); cel.classList.remove('agenda-cell-pressionando'); }); // dedo se moveu = rolando a tela, não é aperta-e-segura
    cel.addEventListener('touchcancel', ()=>{ clearTimeout(longPressTimer); cel.classList.remove('agenda-cell-pressionando'); });
  });

  /* -- Disparos -- */
  const disparoColunaSelect = document.getElementById('disparo-coluna');
  if(disparoColunaSelect) disparoColunaSelect.addEventListener('change', (e)=>{ disparoFiltroColuna = e.target.value; renderApp(); });
  const disparoTempSelect = document.getElementById('disparo-temp');
  if(disparoTempSelect) disparoTempSelect.addEventListener('change', (e)=>{ disparoFiltroTemp = e.target.value; renderApp(); });
  app.querySelectorAll('.disparo-lead-checkbox').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      if(cb.checked) disparoSelecionados.add(cb.dataset.cardId);
      else disparoSelecionados.delete(cb.dataset.cardId);
      renderApp();
    });
  });
  const disparoTextoEl = document.getElementById('disparo-texto');
  if(disparoTextoEl) disparoTextoEl.addEventListener('input', (e)=> disparoTexto = e.target.value);
  const toggleDisparoTemplateEl = app.querySelector('[data-action="toggle-disparo-template"]');
  if(toggleDisparoTemplateEl) toggleDisparoTemplateEl.addEventListener('click', ()=>{ disparoUsarTemplate = !disparoUsarTemplate; renderApp(); });
  const disparoTemplateNomeEl = document.getElementById('disparo-template-nome');
  if(disparoTemplateNomeEl) disparoTemplateNomeEl.addEventListener('input', (e)=> disparoTemplateNome = e.target.value);
  const disparoTemplateIdiomaEl = document.getElementById('disparo-template-idioma');
  if(disparoTemplateIdiomaEl) disparoTemplateIdiomaEl.addEventListener('input', (e)=> disparoTemplateIdioma = e.target.value);
  const disparoTemplateVariaveisEl = document.getElementById('disparo-template-variaveis');
  if(disparoTemplateVariaveisEl) disparoTemplateVariaveisEl.addEventListener('input', (e)=> disparoTemplateVariaveis = e.target.value);
  const carregarTemplatesBtn = app.querySelector('[data-action="carregar-templates"]');
  if(carregarTemplatesBtn) carregarTemplatesBtn.addEventListener('click', carregarTemplatesDisponiveis);
  const disparoSelTodosBtn = app.querySelector('[data-action="disparo-selecionar-todos"]');
  if(disparoSelTodosBtn) disparoSelTodosBtn.addEventListener('click', ()=>{
    board.cards.forEach(c=>{
      const bateColuna = !disparoFiltroColuna || c.columnId===disparoFiltroColuna;
      const bateTemp = !disparoFiltroTemp || c.temperatura===disparoFiltroTemp;
      if(bateColuna && bateTemp && c.telefone) disparoSelecionados.add(c.id);
    });
    renderApp();
  });
  const disparoLimparBtn = app.querySelector('[data-action="disparo-limpar-selecao"]');
  if(disparoLimparBtn) disparoLimparBtn.addEventListener('click', ()=>{ disparoSelecionados.clear(); renderApp(); });
  const enviarDisparoBtn = app.querySelector('[data-action="enviar-disparo"]');
  if(enviarDisparoBtn) enviarDisparoBtn.addEventListener('click', enviarDisparo);

  /* -- Automações -- */
  const openNewAutomacaoBtn = app.querySelector('[data-action="open-new-automacao"]');
  if(openNewAutomacaoBtn) openNewAutomacaoBtn.addEventListener('click', ()=> openNewAutomacao());
  app.querySelectorAll('[data-action="open-edit-automacao"]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEditAutomacao(btn.dataset.automacaoId));
  });
  app.querySelectorAll('[data-action="toggle-automacao"]').forEach(el=>{
    el.addEventListener('click', ()=> toggleAutomacaoAtiva(el.dataset.automacaoId));
  });
  app.querySelectorAll('[data-action="delete-automacao"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.automacaoId;
      showConfirm({
        message: 'Excluir esta automação? Ela para de rodar imediatamente.',
        onConfirm: ()=>{ excluirAutomacao(id); closeConfirm(); },
      });
    });
  });

  /* -- Fluxos -- */
  const openNewFluxoBtn = app.querySelector('[data-action="open-new-fluxo"]');
  if(openNewFluxoBtn) openNewFluxoBtn.addEventListener('click', openNewFluxo);
  app.querySelectorAll('[data-action="open-edit-fluxo"]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEditFluxo(btn.dataset.fluxoId));
  });
  app.querySelectorAll('[data-action="toggle-fluxo"]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const id = el.dataset.fluxoId;
      const f = fluxos.find(x=>x.id===id);
      const temMensagem = f && (f.etapas||[]).some(e=>e.tipo==='mensagem');
      if(f && !f.ativo && temMensagem){
        showConfirm({
          message: `Ativar o fluxo "${f.nome}"? Ele tem etapa(s) de envio de WhatsApp automático, sem revisão sua antes de mandar.`,
          confirmLabel: 'Ativar mesmo assim',
          onConfirm: ()=>{ toggleFluxoAtivo(id); closeConfirm(); },
        });
      } else {
        toggleFluxoAtivo(id);
      }
    });
  });
  app.querySelectorAll('[data-action="delete-fluxo"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.fluxoId;
      showConfirm({
        message: 'Excluir este fluxo? As execuções em andamento pra clientes atuais são interrompidas.',
        onConfirm: ()=>{ excluirFluxo(id); closeConfirm(); },
      });
    });
  });

  /* -- Importar/Exportar -- */
  const planilhaInput = document.getElementById('planilha-input');
  if(planilhaInput) planilhaInput.addEventListener('change', (e)=>{
    const file = e.target.files && e.target.files[0];
    if(file) handlePlanilhaFileSelected(file);
  });
  const mapNomeEl = document.getElementById('map-nome');
  if(mapNomeEl) mapNomeEl.addEventListener('change', (e)=> importMapNome = e.target.value);
  const mapTelefoneEl = document.getElementById('map-telefone');
  if(mapTelefoneEl) mapTelefoneEl.addEventListener('change', (e)=> importMapTelefone = e.target.value);
  const mapServicoEl = document.getElementById('map-servico');
  if(mapServicoEl) mapServicoEl.addEventListener('change', (e)=> importMapServico = e.target.value);
  const confirmarImportBtn = document.getElementById('confirmar-import-planilha');
  if(confirmarImportBtn) confirmarImportBtn.addEventListener('click', confirmarImportPlanilha);
  app.querySelectorAll('[data-action="completar-possivel-lead"]').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirCompletarLead(btn.dataset.leadId));
  });
  app.querySelectorAll('[data-action="descartar-possivel-lead"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.leadId;
      showConfirm({
        message: 'Descartar esse possível lead? Ele não vira cliente.',
        confirmLabel: 'Descartar',
        onConfirm: ()=>{ descartarPossivelLead(id); closeConfirm(); },
      });
    });
  });

  /* -- Agendamentos -- */
  const openNewAgendamentoBtn = app.querySelector('[data-action="open-new-agendamento"]');
  if(openNewAgendamentoBtn) openNewAgendamentoBtn.addEventListener('click', openNewAgendamento);
  app.querySelectorAll('[data-action="cancelar-agendamento"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.agendamentoId;
      showConfirm({
        message: 'Cancelar essa mensagem agendada?',
        confirmLabel: 'Cancelar mensagem',
        onConfirm: ()=>{ cancelarAgendamento(id); closeConfirm(); },
      });
    });
  });
  app.querySelectorAll('[data-action="excluir-agendamento"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.agendamentoId;
      showConfirm({
        message: 'Excluir esse agendamento permanentemente? Não dá pra desfazer.',
        onConfirm: ()=>{ excluirAgendamento(id); closeConfirm(); },
      });
    });
  });

  /* -- Relatórios -- */
  const relatorioFunilSelect = document.getElementById('relatorio-funil-select');
  if(relatorioFunilSelect) relatorioFunilSelect.addEventListener('change', (e)=>{ relatorioFunilId = e.target.value; renderApp(); });
  const exportarCsvBtn = app.querySelector('[data-action="exportar-csv"]');
  if(exportarCsvBtn) exportarCsvBtn.addEventListener('click', exportarCsv);
  const exportarPdfBtn = app.querySelector('[data-action="exportar-relatorio-pdf"]');
  if(exportarPdfBtn) exportarPdfBtn.addEventListener('click', exportarRelatorioPdf);

  /* -- Equipe / Chat Interno / Supervisão -- */
  const equipeNomeInput = document.getElementById('equipe-nome-novo');
  if(equipeNomeInput) equipeNomeInput.addEventListener('input', (e)=> equipeNomeNovo = e.target.value);
  const criarEquipeBtn = app.querySelector('[data-action="criar-equipe"]');
  if(criarEquipeBtn) criarEquipeBtn.addEventListener('click', criarEquipe);
  const equipeCodigoInput = document.getElementById('equipe-codigo-entrar');
  if(equipeCodigoInput) equipeCodigoInput.addEventListener('input', (e)=> equipeCodigoEntrar = e.target.value);
  const entrarEquipeBtn = app.querySelector('[data-action="entrar-equipe"]');
  if(entrarEquipeBtn) entrarEquipeBtn.addEventListener('click', entrarNaEquipe);
  const sairEquipeBtn = app.querySelector('[data-action="sair-equipe"]');
  if(sairEquipeBtn) sairEquipeBtn.addEventListener('click', ()=>{
    showConfirm({
      message: 'Sair dessa equipe? Você perde acesso ao chat interno e à supervisão dela — seu funil continua intocado.',
      confirmLabel: 'Sair da equipe',
      onConfirm: ()=>{ sairDaEquipe(); closeConfirm(); },
    });
  });
  const regenerarCodigoBtn = app.querySelector('[data-action="regenerar-codigo-equipe"]');
  if(regenerarCodigoBtn) regenerarCodigoBtn.addEventListener('click', regenerarCodigoEquipe);
  app.querySelectorAll('[data-action="alterar-papel-membro"]').forEach(btn=>{
    btn.addEventListener('click', ()=> alterarPapelMembro(btn.dataset.userId, btn.dataset.papel));
  });
  app.querySelectorAll('[data-action="toggle-supervisor-dados"]').forEach(btn=>{
    btn.addEventListener('click', ()=> alterarSupervisorDeDados(btn.dataset.userId, btn.dataset.ativo==='1'));
  });
  app.querySelectorAll('[data-action="remover-membro"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      showConfirm({
        message: 'Remover esse membro da equipe? O funil dele continua intocado, só perde acesso ao chat e à supervisão.',
        onConfirm: ()=>{ removerMembro(btn.dataset.userId); closeConfirm(); },
      });
    });
  });
  const chatInternoInput = document.getElementById('chat-interno-input');
  if(chatInternoInput){
    chatInternoInput.addEventListener('input', (e)=> chatTexto = e.target.value);
    chatInternoInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') enviarMensagemChat(); });
  }
  const enviarChatBtn = app.querySelector('[data-action="enviar-chat-interno"]');
  if(enviarChatBtn) enviarChatBtn.addEventListener('click', enviarMensagemChat);
  const chatMsgsEl = document.getElementById('chat-interno-mensagens');
  if(chatMsgsEl) chatMsgsEl.scrollTop = chatMsgsEl.scrollHeight;

  app.querySelectorAll('[data-action="set-equipe-subtab"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      equipeSubTab = btn.dataset.subtab;
      if(equipeSubTab==='chat' && !chatLoaded) loadChat();
      if(equipeSubTab==='supervisao' && equipe && equipe.souSupervisor && !supervisaoLoaded) loadSupervisao();
      if(equipeSubTab==='monitoramento' && equipe && equipe.souSupervisorDeDados && !monitoramentoLoaded) loadMonitoramento();
      renderApp();
    });
  });
  app.querySelectorAll('[data-action="abrir-conversa-individual"]').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirConversaIndividual(btn.dataset.userId));
  });
  const fecharDmBtn = app.querySelector('[data-action="fechar-conversa-individual"]');
  if(fecharDmBtn) fecharDmBtn.addEventListener('click', ()=>{ dmDestinatarioId = null; renderApp(); });
  const chatIndividualInput = document.getElementById('chat-individual-input');
  if(chatIndividualInput){
    chatIndividualInput.addEventListener('input', (e)=> dmTexto = e.target.value);
    chatIndividualInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') enviarMensagemIndividual(); });
  }
  const enviarDmBtn = app.querySelector('[data-action="enviar-chat-individual"]');
  if(enviarDmBtn) enviarDmBtn.addEventListener('click', enviarMensagemIndividual);
  const dmMsgsEl = document.getElementById('chat-individual-mensagens');
  if(dmMsgsEl) dmMsgsEl.scrollTop = dmMsgsEl.scrollHeight;

  /* -- Comissões -- */
  app.querySelectorAll('[data-action="comissoes-mes"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ comissoesMonth = addMonthsKey(comissoesMonth, parseInt(btn.dataset.delta,10)); renderApp(); });
  });
  const openNewContratoBtn = app.querySelector('[data-action="open-new-contrato"]');
  if(openNewContratoBtn) openNewContratoBtn.addEventListener('click', openNewContrato);
  const openRegrasBtn = app.querySelector('[data-action="open-regras-comissao"]');
  if(openRegrasBtn) openRegrasBtn.addEventListener('click', openRegrasComissaoModal);
  app.querySelectorAll('[data-action="open-edit-contrato"]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEditContrato(btn.dataset.contratoId));
  });
  app.querySelectorAll('[data-action="delete-contrato"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.contratoId;
      showConfirm({
        message: 'Excluir este contrato de comissão? Essa ação não pode ser desfeita.',
        onConfirm: ()=>{ deleteContratoById(id); closeConfirm(); },
      });
    });
  });
  app.querySelectorAll('[data-action="cancelar-contrato"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.contratoId;
      showConfirm({
        message: `Marcar esse contrato como cancelado a partir de ${monthLabel(comissoesMonth, true)}? As parcelas desse mês em diante param de contar — os meses anteriores continuam valendo.`,
        confirmLabel: 'Cancelar comissão',
        onConfirm: ()=>{ cancelarContrato(id); closeConfirm(); },
      });
    });
  });
  app.querySelectorAll('[data-action="reativar-contrato"]').forEach(btn=>{
    btn.addEventListener('click', ()=> reativarContrato(btn.dataset.contratoId));
  });

  /* -- Configurações -- */
  app.querySelectorAll('[data-action="set-config-categoria"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      configCategoriaAtiva = btn.dataset.categoria;
      renderApp();
    });
  });
  const avatarInput = document.getElementById('avatar-input');
  if(avatarInput) avatarInput.addEventListener('change', (e)=>{
    const file = e.target.files && e.target.files[0];
    if(file) handleAvatarFileSelected(file);
  });
  const avatarRemoverBtn = document.getElementById('avatar-remover-btn');
  if(avatarRemoverBtn) avatarRemoverBtn.addEventListener('click', removerAvatar);
  const abrirEditarPerfilBtn = app.querySelector('[data-action="abrir-editar-perfil"]');
  if(abrirEditarPerfilBtn) abrirEditarPerfilBtn.addEventListener('click', abrirEditarPerfilModal);
  // A bolinha da foto: clique rápido abre o seletor de arquivo (trocar/adicionar foto);
  // clique e segure (ou toque e segure, no celular) abre a foto atual em tamanho maior.
  const avatarPreview = document.getElementById('avatar-preview');
  if(avatarPreview){
    const iniciarPress = ()=>{
      clearTimeout(avatarPressTimer);
      avatarPressTimer = setTimeout(()=>{
        avatarPressDisparou = true;
        abrirAvatarLightbox();
      }, 550);
    };
    const cancelarPress = ()=> clearTimeout(avatarPressTimer);
    avatarPreview.addEventListener('mousedown', iniciarPress);
    avatarPreview.addEventListener('mouseup', cancelarPress);
    avatarPreview.addEventListener('mouseleave', cancelarPress);
    avatarPreview.addEventListener('touchstart', iniciarPress, { passive:true });
    avatarPreview.addEventListener('touchend', cancelarPress);
    avatarPreview.addEventListener('touchmove', cancelarPress);
    avatarPreview.addEventListener('touchcancel', cancelarPress);
    avatarPreview.addEventListener('contextmenu', (e)=> e.preventDefault());
    avatarPreview.addEventListener('click', ()=>{
      if(avatarPressDisparou){ avatarPressDisparou = false; return; } // ignora o clique fantasma depois de segurar
      if(avatarInput) avatarInput.click();
    });
  }
  const logoutAllBtn = app.querySelector('[data-action="desconectar-todos"]');
  if(logoutAllBtn) logoutAllBtn.addEventListener('click', ()=>{
    showConfirm({
      message: 'Desconectar todos os dispositivos, incluindo este? Você vai precisar fazer login de novo.',
      confirmLabel: 'Desconectar',
      onConfirm: ()=>{ desconectarTodosDispositivos(); closeConfirm(); },
    });
  });
  const abrirSenhaBtn = app.querySelector('[data-action="abrir-alterar-senha"]');
  if(abrirSenhaBtn) abrirSenhaBtn.addEventListener('click', abrirAlterarSenhaModal);
  const toggleAuditoriaBtn = app.querySelector('[data-action="toggle-auditoria"]');
  if(toggleAuditoriaBtn) toggleAuditoriaBtn.addEventListener('click', ()=>{ auditoriaExpandida = !auditoriaExpandida; renderApp(); });
  const atualizarMonitoramentoBtn = app.querySelector('[data-action="atualizar-monitoramento"]');
  if(atualizarMonitoramentoBtn) atualizarMonitoramentoBtn.addEventListener('click', loadMonitoramento);
  const limparMonitoramentoBtn = app.querySelector('[data-action="limpar-monitoramento"]');
  if(limparMonitoramentoBtn) limparMonitoramentoBtn.addEventListener('click', limparMonitoramento);
  const importColunaSelect = document.getElementById('import-coluna');
  if(importColunaSelect) importColunaSelect.addEventListener('change', (e)=> importColumnId = e.target.value);
  const importBtn = document.getElementById('import-btn');
  if(importBtn) importBtn.addEventListener('click', importarLeadsCsv);

  const novoCampoNomeEl = document.getElementById('novo-campo-nome');
  if(novoCampoNomeEl) novoCampoNomeEl.addEventListener('input', (e)=> novoCampoNome = e.target.value);
  const novoCampoTipoEl = document.getElementById('novo-campo-tipo');
  if(novoCampoTipoEl) novoCampoTipoEl.addEventListener('change', (e)=> novoCampoTipo = e.target.value);
  const criarCampoBtn = app.querySelector('[data-action="criar-campo-personalizado"]');
  if(criarCampoBtn) criarCampoBtn.addEventListener('click', criarCampoPersonalizado);

  const criarWebhookBtn = app.querySelector('[data-action="criar-webhook-saida"]');
  if(criarWebhookBtn) criarWebhookBtn.addEventListener('click', criarWebhookSaida);
  app.querySelectorAll('[data-action="testar-webhook-saida"]').forEach(btn=>{
    btn.addEventListener('click', ()=> testarWebhookSaida(btn.dataset.webhookId));
  });
  app.querySelectorAll('[data-action="toggle-webhook-saida"]').forEach(btn=>{
    btn.addEventListener('click', ()=> toggleWebhookSaida(btn.dataset.webhookId, btn.dataset.ativo==='1'));
  });
  app.querySelectorAll('[data-action="excluir-webhook-saida"]').forEach(btn=>{
    btn.addEventListener('click', ()=> excluirWebhookSaida(btn.dataset.webhookId));
  });
  const toggleAgendamentoPublicoBtn = app.querySelector('[data-action="toggle-agendamento-publico-ativo"]');
  if(toggleAgendamentoPublicoBtn) toggleAgendamentoPublicoBtn.addEventListener('click', toggleAgendamentoPublicoAtivo);
  const salvarAgendamentoPublicoBtn = app.querySelector('[data-action="salvar-agendamento-publico"]');
  if(salvarAgendamentoPublicoBtn) salvarAgendamentoPublicoBtn.addEventListener('click', salvarAgendamentoPublico);
  const copiarLinkBtn = app.querySelector('[data-action="copiar-link-agendamento"]');
  if(copiarLinkBtn) copiarLinkBtn.addEventListener('click', copiarLinkAgendamento);
  app.querySelectorAll('[data-action="excluir-campo-personalizado"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.campoId;
      showConfirm({
        message: 'Excluir esse campo personalizado? Ele para de aparecer nos clientes.',
        onConfirm: ()=>{ excluirCampoPersonalizado(id); closeConfirm(); },
      });
    });
  });

  const salvarWaBtn = app.querySelector('[data-action="salvar-whatsapp-config"]');
  if(salvarWaBtn) salvarWaBtn.addEventListener('click', salvarWhatsappConfig);
  const desconectarWaBtn = app.querySelector('[data-action="desconectar-whatsapp"]');
  if(desconectarWaBtn) desconectarWaBtn.addEventListener('click', desconectarWhatsapp);

  const toggleAgenteIaEl = app.querySelector('[data-action="toggle-agente-ia"]');
  if(toggleAgenteIaEl) toggleAgenteIaEl.addEventListener('click', ()=>{
    if(!agenteIaAtivo){
      showConfirm({
        message: 'Ativar o agente de IA? Ele vai responder mensagens de WhatsApp automaticamente, sem você revisar antes de enviar. Sempre que você responder um cliente manualmente, o agente fica em silêncio por 30 minutos naquela conversa. Pode desativar a qualquer momento.',
        confirmLabel: 'Ativar mesmo assim',
        onConfirm: ()=>{ definirAgenteIa(true); closeConfirm(); },
      });
    } else {
      definirAgenteIa(false);
    }
  });
  const toggleIaProativaEl = app.querySelector('[data-action="toggle-ia-proativa"]');
  if(toggleIaProativaEl) toggleIaProativaEl.addEventListener('click', ()=> definirIaProativa(!iaProativaAtiva));

  const mtMensagemEl = document.getElementById('mt-mensagem');
  if(mtMensagemEl) mtMensagemEl.addEventListener('input', (e)=> menuTriagem.mensagemInicial = e.target.value);
  const mtAddOpcaoBtn = document.getElementById('mt-add-opcao');
  if(mtAddOpcaoBtn) mtAddOpcaoBtn.addEventListener('click', ()=>{
    menuTriagem.opcoes.push({ numero: String(menuTriagem.opcoes.length+1), colunaDestinoId: (board.columns[0]||{}).id || '', respostaConfirmacao:'' });
    renderApp();
  });
  document.querySelectorAll('.mt-opcao-remover').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      menuTriagem.opcoes.splice(parseInt(btn.dataset.idx,10),1);
      renderApp();
    });
  });
  document.querySelectorAll('.mt-opcao-numero').forEach(el=>{
    el.addEventListener('input', (e)=>{ menuTriagem.opcoes[parseInt(el.dataset.idx,10)].numero = e.target.value; });
  });
  document.querySelectorAll('.mt-opcao-coluna').forEach(el=>{
    el.addEventListener('change', (e)=>{ menuTriagem.opcoes[parseInt(el.dataset.idx,10)].colunaDestinoId = e.target.value; });
  });
  document.querySelectorAll('.mt-opcao-confirmacao').forEach(el=>{
    el.addEventListener('input', (e)=>{ menuTriagem.opcoes[parseInt(el.dataset.idx,10)].respostaConfirmacao = e.target.value; });
  });
  const toggleMenuTriagemEl = app.querySelector('[data-action="toggle-menu-triagem"]');
  if(toggleMenuTriagemEl) toggleMenuTriagemEl.addEventListener('click', ()=>{ menuTriagem.ativo = !menuTriagem.ativo; renderApp(); });
  const salvarMenuTriagemBtn = document.getElementById('mt-salvar');
  if(salvarMenuTriagemBtn) salvarMenuTriagemBtn.addEventListener('click', ()=>{
    if(menuTriagem.ativo){
      showConfirm({
        message: 'Salvar e manter o menu de triagem ativo? Ele vai responder automaticamente qualquer contato novo no WhatsApp, sem revisão sua.',
        confirmLabel: 'Manter ativo',
        onConfirm: ()=>{ salvarMenuTriagem(); closeConfirm(); },
      });
    } else {
      salvarMenuTriagem();
    }
  });

  const twofaIniciarBtn = document.getElementById('twofa-iniciar');
  if(twofaIniciarBtn) twofaIniciarBtn.addEventListener('click', iniciar2FA);
  const twofaCancelarSetupBtn = document.getElementById('twofa-cancelar-setup');
  if(twofaCancelarSetupBtn) twofaCancelarSetupBtn.addEventListener('click', cancelarSetup2FA);
  const twofaConfirmarBtn = document.getElementById('twofa-confirmar');
  if(twofaConfirmarBtn) twofaConfirmarBtn.addEventListener('click', confirmar2FA);
  const twofaMostrarDesativarBtn = document.getElementById('twofa-mostrar-desativar');
  if(twofaMostrarDesativarBtn) twofaMostrarDesativarBtn.addEventListener('click', ()=>{ mostrarDesativar2FA = true; renderApp(); });
  const twofaCancelarDesativarBtn = document.getElementById('twofa-cancelar-desativar');
  if(twofaCancelarDesativarBtn) twofaCancelarDesativarBtn.addEventListener('click', ()=>{ mostrarDesativar2FA = false; twoFactorMsg = null; renderApp(); });
  const twofaConfirmarDesativarBtn = document.getElementById('twofa-confirmar-desativar');
  if(twofaConfirmarDesativarBtn) twofaConfirmarDesativarBtn.addEventListener('click', desativar2FA);
  if(twoFactorSetup) renderizarQrCode2FA();

  const salvarIgBtn = app.querySelector('[data-action="salvar-instagram-config"]');
  if(salvarIgBtn) salvarIgBtn.addEventListener('click', salvarInstagramConfig);
  const desconectarIgBtn = app.querySelector('[data-action="desconectar-instagram"]');
  if(desconectarIgBtn) desconectarIgBtn.addEventListener('click', desconectarInstagram);
  const sincronizarTemplatesBtn = app.querySelector('[data-action="sincronizar-templates"]');
  if(sincronizarTemplatesBtn) sincronizarTemplatesBtn.addEventListener('click', sincronizarTemplates);
  const openNewTemplateBtn = app.querySelector('[data-action="open-new-template"]');
  if(openNewTemplateBtn) openNewTemplateBtn.addEventListener('click', openNewTemplateModal);

  /* -- Leads -- */
  const openNewLeadBtn = app.querySelector('[data-action="open-new-lead"]');
  if(openNewLeadBtn) openNewLeadBtn.addEventListener('click', ()=> openNewCard());
  const exportarLeadsBtn = app.querySelector('[data-action="exportar-leads"]');
  if(exportarLeadsBtn) exportarLeadsBtn.addEventListener('click', exportarLeads);
  const toggleArquivadosBtn = app.querySelector('[data-action="toggle-mostrar-arquivados"]');
  if(toggleArquivadosBtn) toggleArquivadosBtn.addEventListener('click', ()=>{ mostrarArquivados = !mostrarArquivados; renderApp(); });

  /* -- Leads: seleção e ações em massa -- */
  const selectAllEl = app.querySelector('[data-action="leads-select-all"]');
  if(selectAllEl){
    selectAllEl.addEventListener('click', ()=>{
      const idsVisiveis = filteredLeads().map(c=>c.id);
      toggleSelecionarTodosLeads(idsVisiveis);
    });
  }
  app.querySelectorAll('[data-action="leads-select-um"]').forEach(el=>{
    el.addEventListener('click', ()=> toggleSelecaoLead(el.dataset.cardId));
  });
  const bulkColunaSelect = document.getElementById('leads-bulk-coluna');
  if(bulkColunaSelect) bulkColunaSelect.addEventListener('change', (e)=> bulkMoverLeads(e.target.value));
  const bulkArquivarBtn = app.querySelector('[data-action="leads-bulk-arquivar"]');
  if(bulkArquivarBtn) bulkArquivarBtn.addEventListener('click', bulkArquivarLeads);
  const bulkExcluirBtn = app.querySelector('[data-action="leads-bulk-excluir"]');
  if(bulkExcluirBtn) bulkExcluirBtn.addEventListener('click', ()=>{
    const qtd = leadsSelecionados.size;
    showConfirm({
      message: `Excluir ${qtd} cliente${qtd===1?'':'s'} selecionado${qtd===1?'':'s'}? Essa ação não pode ser desfeita.`,
      onConfirm: ()=>{ bulkExcluirLeads(); closeConfirm(); },
    });
  });
  const bulkLimparBtn = app.querySelector('[data-action="leads-bulk-limpar"]');
  if(bulkLimparBtn) bulkLimparBtn.addEventListener('click', ()=>{ leadsSelecionados.clear(); renderApp(); });
  const bulkEtiquetaBtn = app.querySelector('[data-action="leads-bulk-etiqueta"]');
  if(bulkEtiquetaBtn) bulkEtiquetaBtn.addEventListener('click', ()=>{ leadsBulkEtiquetaAberta = true; renderApp(); });
  const bulkEtiquetaInput = document.getElementById('leads-bulk-etiqueta-input');
  if(bulkEtiquetaInput){
    bulkEtiquetaInput.addEventListener('input', (e)=> leadsBulkEtiquetaValor = e.target.value);
    bulkEtiquetaInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') confirmarBulkEtiqueta(); });
  }
  const bulkEtiquetaConfirmarBtn = app.querySelector('[data-action="leads-bulk-etiqueta-confirmar"]');
  if(bulkEtiquetaConfirmarBtn) bulkEtiquetaConfirmarBtn.addEventListener('click', confirmarBulkEtiqueta);

  const leadsSearchInput = document.getElementById('leads-search-input');
  if(leadsSearchInput) leadsSearchInput.addEventListener('input', (e)=>{
    const cursorPos = e.target.selectionStart;
    leadsSearch = e.target.value;
    renderApp();
    const novoInput = document.getElementById('leads-search-input');
    if(novoInput){ novoInput.focus(); novoInput.setSelectionRange(cursorPos, cursorPos); }
  });
  const leadsFilterSelect = document.getElementById('leads-status-filter');
  if(leadsFilterSelect) leadsFilterSelect.addEventListener('change', (e)=>{ leadsStatusFilter = e.target.value; renderApp(); });

  /* -- botão de funil de ordenação, compartilhado entre Leads, Pipeline e Comissões -- */
  app.querySelectorAll('[data-action="toggle-ordenar-menu"]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      ordenarMenuAberto = ordenarMenuAberto === btn.dataset.menuId ? null : btn.dataset.menuId;
      renderApp();
    });
  });
  app.querySelectorAll('[data-action="escolher-ordenar"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const menuId = btn.dataset.menuId;
      const valor = btn.dataset.valor;
      ordenarMenuAberto = null;
      if(menuId === 'leads'){ leadsOrdenarPor = valor; renderApp(); }
      else if(menuId === 'comissoes'){ comissoesOrdenarPor = valor; renderApp(); }
      else if(menuId === 'pipeline'){ aplicarOrdenacaoPipeline(valor); }
    });
  });

  /* -- Pipeline: funis -- */
  app.querySelectorAll('[data-action="set-funil"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      funilAtualId = btn.dataset.funilId;
      aiInsights = []; // insights são específicos do funil — limpa pra não mostrar dado desatualizado de outro
      renderApp();
    });
  });
  const novoFunilBtn = app.querySelector('[data-action="open-new-funil"]');
  if(novoFunilBtn) novoFunilBtn.addEventListener('click', criarNovoFunil);
  const editFunilBtn = app.querySelector('[data-action="edit-funil-name"]');
  if(editFunilBtn) editFunilBtn.addEventListener('click', ()=>{
    editingFunilId = editFunilBtn.dataset.funilId;
    const f = funis.find(x=>x.id===editingFunilId);
    editingFunilName = f ? f.nome : '';
    renderApp();
    const input = document.getElementById('funil-rename-'+editingFunilId);
    if(input){ input.focus(); input.select(); }
  });
  document.querySelectorAll('[id^="funil-rename-"]').forEach(input=>{
    input.addEventListener('input', (e)=>{ editingFunilName = e.target.value; });
    const commitFunil = ()=>{ const id = editingFunilId; editingFunilId = null; renomearFunil(id, editingFunilName); };
    input.addEventListener('blur', commitFunil);
    input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') e.target.blur(); });
  });
  const deleteFunilBtn = app.querySelector('[data-action="delete-funil"]');
  if(deleteFunilBtn) deleteFunilBtn.addEventListener('click', ()=>{
    const id = deleteFunilBtn.dataset.funilId;
    const f = funis.find(x=>x.id===id);
    showConfirm({
      message: `Excluir o funil "${f.nome}"? Todas as colunas e clientes dele também serão excluídos.`,
      onConfirm: ()=>{ excluirFunil(id); closeConfirm(); },
    });
  });
  const duplicarFunilBtn = app.querySelector('[data-action="duplicar-funil"]');
  if(duplicarFunilBtn) duplicarFunilBtn.addEventListener('click', ()=> duplicarFunil(duplicarFunilBtn.dataset.funilId));
  ativarArrasteHorizontal();
  ajustarAlturaColunasPipeline();
  ativarRedimensionarStats();
  ajustarLargurasStatsPadrao();

  /* -- Pipeline: filtro de data -- */
  const dateMenuBtn = app.querySelector('[data-action="toggle-date-menu"]');
  if(dateMenuBtn) dateMenuBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    dateMenuOpen = !dateMenuOpen;
    renderApp();
  });
  app.querySelectorAll('[data-action="set-month"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ filterMonth = btn.dataset.month || null; dateMenuOpen = false; renderApp(); });
  });
  const gotoInput = document.getElementById('goto-month-input');
  if(gotoInput) gotoInput.addEventListener('change', (e)=>{ if(e.target.value){ filterMonth = e.target.value; dateMenuOpen = false; renderApp(); } });
  const esfriandoBtn = app.querySelector('[data-action="toggle-esfriando"]');
  if(esfriandoBtn) esfriandoBtn.addEventListener('click', ()=>{ filtroEsfriando = !filtroEsfriando; renderApp(); });

  /* -- Pipeline: colunas -- */
  app.querySelectorAll('[data-action="edit-col-name"]').forEach(el=>{
    el.addEventListener('click', ()=>{
      editingColId = el.dataset.colId;
      const col = board.columns.find(c=>c.id===editingColId);
      editingColName = col ? col.nome : '';
      renderApp();
      const input = document.getElementById('col-rename-'+editingColId);
      if(input){ input.focus(); input.select(); }
    });
  });
  app.querySelectorAll('[id^="col-rename-"]').forEach(input=>{
    input.addEventListener('input', (e)=>{ editingColName = e.target.value; });
    const commit = ()=>{ const id = editingColId; editingColId=null; renameColumn(id, editingColName); };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') e.target.blur(); });
  });

  app.querySelectorAll('[data-action="toggle-col-menu"]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      openMenuColId = (openMenuColId===btn.dataset.colId) ? null : btn.dataset.colId;
      renderApp();
    });
  });
  app.querySelectorAll('[data-action="toggle-move-menu"]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      openMoveMenuCardId = (openMoveMenuCardId===btn.dataset.cardId) ? null : btn.dataset.cardId;
      renderFloatingMoveMenu(); // só o menu flutuante — não precisa redesenhar a página toda (isso resetava a rolagem)
    });
  });
  app.querySelectorAll('[data-action="set-col-tipo"]').forEach(btn=>{
    btn.addEventListener('click', ()=> changeTipo(btn.dataset.colId, btn.dataset.tipo));
  });
  document.querySelectorAll('.col-menu-prob-input').forEach(input=>{
    input.addEventListener('blur', (e)=> salvarProbabilidadeColuna(input.dataset.colId, e.target.value));
    input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') e.target.blur(); });
  });
  app.querySelectorAll('[data-action="delete-col"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.colId;
      const col = board.columns.find(c=>c.id===id);
      const n = cardsOf(id).length;
      openMenuColId = null;
      renderApp();
      showConfirm({
        message: n ? `Excluir a coluna "${col.nome}"? Os ${n} cliente(s) dela também serão removidos.` : `Excluir a coluna "${col.nome}"?`,
        onConfirm: ()=>{ deleteColumnById(id); closeConfirm(); },
      });
    });
  });

  /* -- Pipeline / Leads: cards -- */
  app.querySelectorAll('[data-action="open-add-lead-choice"]').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirEscolhaAdicionarLead(btn.dataset.colId));
  });
  app.querySelectorAll('[data-action="open-new-card"]').forEach(btn=>{
    btn.addEventListener('click', ()=> openNewCard(btn.dataset.colId));
  });
  app.querySelectorAll('[data-action="open-edit-card"]').forEach(el=>{
    el.addEventListener('click', ()=> openEditCard(el.dataset.cardId));
  });
  app.querySelectorAll('[data-action="open-whatsapp"]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      abrirWhatsapp(btn.dataset.phone);
    });
  });

  app.querySelectorAll('[data-action="start-add-col"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ addingCol=true; newColNameVal=''; renderApp();
      const inp = document.getElementById('new-col-input'); if(inp) inp.focus();
    });
  });
  const newColInput = document.getElementById('new-col-input');
  if(newColInput){
    newColInput.addEventListener('input', (e)=>{ newColNameVal = e.target.value; });
    newColInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') addColumn(); });
  }
  app.querySelectorAll('[data-action="confirm-add-col"]').forEach(btn=> btn.addEventListener('click', addColumn));
  app.querySelectorAll('[data-action="cancel-add-col"]').forEach(btn=> btn.addEventListener('click', ()=>{ addingCol=false; newColNameVal=''; renderApp(); }));

  /* drag and drop */
  app.querySelectorAll('.card').forEach(cardEl=>{
    cardEl.addEventListener('dragstart', (e)=>{
      e.dataTransfer.setData('text/x-crm-card', cardEl.dataset.cardId);
      cardEl.classList.add('dragging');
    });
    cardEl.addEventListener('dragend', ()=>{ cardEl.classList.remove('dragging'); clearInterval(autoScrollDoArrastoInterval); limparIndicadorDeInsercao(); document.querySelectorAll('.column.coluna-drag-alvo').forEach(c=> c.classList.remove('coluna-drag-alvo')); });

    // Arrastar por toque no card inteiro — usa Pointer Events com setPointerCapture.
    // O CSS do .card já trava touch-action:none desde o início (precisa ser assim,
    // travar depois que o toque já começou não tem efeito — é por isso que antes
    // tocar e segurar acabava selecionando texto: o navegador assumia esse gesto
    // por conta própria). Só que travar touch-action:none tira a rolagem nativa da
    // lista também — por isso, aqui embaixo, quando o gesto claramente é rolar (dedo
    // se move rápido, sem pausa) em vez de arrastar (segura parado um instante), a
    // gente rola a lista na mão, imitando o que o navegador faria sozinho.
    cardEl.addEventListener('pointerdown', (e)=>{
      if(e.pointerType === 'mouse') return;
      if(e.target.closest('.card-move-wrap') || e.target.closest('[data-action="toggle-move-menu"]') || e.target.closest('.wa-btn')) return; // não conflita com os botões
      const cardsContainer = cardEl.closest('.cards');
      cardTouchDrag = {
        cardId: cardEl.dataset.cardId, cardEl, arrastando:false, modoRolagem:false,
        startX:e.clientX, startY:e.clientY, ultimoX:e.clientX, ultimoY:e.clientY,
        pointerId:e.pointerId, cardsContainer, scrollInicial: cardsContainer ? cardsContainer.scrollTop : 0,
      };
      cardTouchLongPressTimer = setTimeout(()=>{
        if(!cardTouchDrag || cardTouchDrag.modoRolagem) return; // já virou rolagem, não inicia arrastar
        try{ cardEl.setPointerCapture(cardTouchDrag.pointerId); }catch(err){ /* aparelho sem suporte — segue sem capturar */ }
        iniciarArrastoDeCard(cardTouchDrag.ultimoX, cardTouchDrag.ultimoY);
      }, 280);
    });

    cardEl.addEventListener('pointermove', (e)=>{
      if(!cardTouchDrag || cardTouchDrag.cardEl !== cardEl || cardTouchDrag.pointerId !== e.pointerId) return;
      const dxTotal = e.clientX - cardTouchDrag.startX;
      const dyTotal = e.clientY - cardTouchDrag.startY;
      cardTouchDrag.ultimoX = e.clientX;
      cardTouchDrag.ultimoY = e.clientY;

      if(!cardTouchDrag.arrastando && !cardTouchDrag.modoRolagem){
        if(Math.sqrt(dxTotal*dxTotal + dyTotal*dyTotal) > 10){
          // se moveu antes do temporizador confirmar o arrastar, é rolagem, não segurar-parado
          clearTimeout(cardTouchLongPressTimer);
          cardTouchDrag.modoRolagem = true;
        } else {
          return; // ainda não decidiu — pode virar arrastar (temporizador) ou rolagem (mais movimento)
        }
      }

      if(cardTouchDrag.modoRolagem){
        e.preventDefault();
        if(cardTouchDrag.cardsContainer) cardTouchDrag.cardsContainer.scrollTop = cardTouchDrag.scrollInicial - dyTotal;
        return;
      }

      if(!cardTouchDrag.arrastando) return; // ainda esperando o temporizador decidir
      e.preventDefault();
      atualizarArrastoDeCard(e.clientX, e.clientY);
    }, { passive:false });

    cardEl.addEventListener('pointerup', (e)=>{
      clearTimeout(cardTouchLongPressTimer);
      if(!cardTouchDrag || cardTouchDrag.cardEl !== cardEl || cardTouchDrag.pointerId !== e.pointerId) return;
      if(cardTouchDrag.arrastando){
        e.preventDefault(); // evita o clique fantasma que abriria o card logo depois de soltar
        finalizarArrastoDeCard(e.clientX, e.clientY);
      }
      cardTouchDrag = null;
    });
    cardEl.addEventListener('pointercancel', ()=>{
      clearTimeout(cardTouchLongPressTimer);
      if(cardTouchDrag && cardTouchDrag.cardEl === cardEl && cardTouchDrag.arrastando) cancelarArrastoDeCard();
      cardTouchDrag = null;
    });
  });
  app.querySelectorAll('[data-action="drag-col-handle"]').forEach(gripEl=>{
    gripEl.addEventListener('dragstart', (e)=>{
      e.stopPropagation();
      e.dataTransfer.setData('text/x-crm-column', gripEl.dataset.colId);
      const colEl = gripEl.closest('.column');
      if(colEl) colEl.classList.add('dragging-col');
    });
    gripEl.addEventListener('dragend', (e)=>{
      e.stopPropagation();
      const colEl = gripEl.closest('.column');
      if(colEl) colEl.classList.remove('dragging-col');
    });
  });
  app.querySelectorAll('.column').forEach(colEl=>{
    colEl.addEventListener('dragenter', (e)=> e.preventDefault());
    colEl.addEventListener('dragover', (e)=>{
      e.preventDefault();
      atualizarAutoScrollDoArrasto(e.clientX, e.clientY, colEl);
      const cardArrastandoEl = document.querySelector('.card.dragging');
      if(cardArrastandoEl){
        mostrarIndicadorDeInsercao(colEl, e.clientY, cardArrastandoEl.dataset.cardId);
        // mesmo destaque cinza que já existia no arrastar por toque — dá a mesma
        // confirmação visual clara de "aqui vai soltar" também no mouse
        document.querySelectorAll('.column.coluna-drag-alvo').forEach(c=>{ if(c!==colEl) c.classList.remove('coluna-drag-alvo'); });
        colEl.classList.add('coluna-drag-alvo');
      }
    });
    colEl.addEventListener('dragleave', (e)=>{
      clearInterval(autoScrollDoArrastoInterval);
      // só tira o destaque se o mouse realmente saiu da coluna (não só passou por cima
      // de um card filho dentro dela, o que também dispara dragleave por engano)
      if(!colEl.contains(e.relatedTarget)) colEl.classList.remove('coluna-drag-alvo');
    });
    colEl.addEventListener('drop', (e)=>{
      e.preventDefault();
      clearInterval(autoScrollDoArrastoInterval);
      limparIndicadorDeInsercao();
      colEl.classList.remove('coluna-drag-alvo');
      const colId = e.dataTransfer.getData('text/x-crm-column');
      const cardId = e.dataTransfer.getData('text/x-crm-card');
      if(colId) reorderColumns(colId, colEl.dataset.colId);
      else if(cardId){
        const ordem = calcularOrdemDeInsercao(colEl, e.clientY, cardId);
        moveCard(cardId, colEl.dataset.colId, ordem);
      }
    });
  });

  document.addEventListener('click', closeMenusOnOutsideClick);
  document.addEventListener('dragover', permitirDropForaDasColunas);
  document.addEventListener('dragenter', permitirDropForaDasColunas);
  renderFloatingMoveMenu();
}
// Renderiza o menu "Mover para" fora do card (que tem overflow:hidden e cortava as
// opções de baixo) — usa uma raiz própria, colada no fim do <body>, posicionada via
// JS com as coordenadas reais do botão que foi clicado.
// Arrastar card por toque — cria um "fantasma" fixo que segue o dedo, deixando bem
// visível o que está sendo movido. O fantasma tem pointer-events:none de propósito,
// senão ele mesmo apareceria como "o que está embaixo do dedo" ao consultar
// elementFromPoint, escondendo a coluna real por trás dele.
function iniciarArrastoDeCard(x, y){
  if(!cardTouchDrag) return;
  cardTouchDrag.arrastando = true;
  const rect = cardTouchDrag.cardEl.getBoundingClientRect();
  cardTouchDrag.cardEl.classList.add('card-touch-arrastando');
  const fantasma = document.createElement('div');
  fantasma.id = 'card-touch-fantasma';
  fantasma.className = 'card-touch-fantasma';
  fantasma.style.width = rect.width + 'px';
  fantasma.style.left = (x - rect.width/2) + 'px';
  fantasma.style.top = (y - 24) + 'px';
  fantasma.innerHTML = cardTouchDrag.cardEl.querySelector('.card-body') ? cardTouchDrag.cardEl.querySelector('.card-body').innerHTML : cardTouchDrag.cardEl.innerHTML;
  document.body.appendChild(fantasma);
  cardTouchDrag.fantasmaEl = fantasma;
  if(navigator.vibrate) navigator.vibrate(15);
  atualizarArrastoDeCard(x, y);
}
function atualizarArrastoDeCard(x, y){
  if(!cardTouchDrag || !cardTouchDrag.fantasmaEl) return;
  // isso aqui é barato — atualiza sempre na hora, o fantasma nunca fica atrasado atrás do dedo
  cardTouchDrag.fantasmaEl.style.left = (x - cardTouchDrag.fantasmaEl.offsetWidth/2) + 'px';
  cardTouchDrag.fantasmaEl.style.top = (y - 24) + 'px';
  cardTouchDrag.ultimoXCalculo = x;
  cardTouchDrag.ultimoYCalculo = y;
  // isso aqui é caro (olha a posição de TODOS os cards da coluna, toda vez) — segurando
  // por muito tempo, o dedo dispara centenas de eventos de movimento, e refazer essa
  // conta pesada em cada um deles ia acumulando trabalho e deixando tudo mais lento
  // (parecendo "parar de reconhecer" depois de um tempo). Por isso, no máximo uma vez
  // por quadro de tela (~60x por segundo), nunca mais que isso.
  if(arrastoRafPendente) return;
  arrastoRafPendente = true;
  requestAnimationFrame(()=>{
    arrastoRafPendente = false;
    if(!cardTouchDrag) return;
    const xAtual = cardTouchDrag.ultimoXCalculo, yAtual = cardTouchDrag.ultimoYCalculo;
    const colAlvo = encontrarColunaMaisProxima(xAtual);
    document.querySelectorAll('.column.coluna-drag-alvo').forEach(c=> c.classList.remove('coluna-drag-alvo'));
    if(colAlvo){
      colAlvo.classList.add('coluna-drag-alvo');
      mostrarIndicadorDeInsercao(colAlvo, yAtual, cardTouchDrag.cardId);
    }
    atualizarAutoScrollDoArrasto(xAtual, yAtual, colAlvo);
  });
}
// Acha a coluna sob o dedo — e se não achar nenhuma exatamente ali (dedo soltou bem
// na borda entre duas colunas, ou num pixel qualquer fora delas), pega a mais próxima
// pela posição horizontal, em vez de simplesmente desistir. É bem mais tolerante que
// depender de acertar o pixel exato num aparelho de toque.
function encontrarColunaMaisProxima(x){
  const colunas = [...document.querySelectorAll('.column')];
  if(!colunas.length) return null;
  const dentro = colunas.find(c=>{
    const r = c.getBoundingClientRect();
    return x >= r.left && x <= r.right;
  });
  if(dentro) return dentro;
  let maisProxima = null, menorDist = Infinity;
  colunas.forEach(c=>{
    const r = c.getBoundingClientRect();
    const centro = (r.left + r.right) / 2;
    const dist = Math.abs(x - centro);
    if(dist < menorDist){ menorDist = dist; maisProxima = c; }
  });
  return maisProxima;
}
// Rola a tela sozinha quando o dedo (arrastando um card) chega perto da borda —
// horizontal pra passar de uma coluna pra outra que não estava visível, vertical
// pra descer/subir dentro de uma coluna comprida. Fica repetindo a cada quadro
// enquanto o dedo continuar perto da borda; some assim que ele se afasta.
// Sem isso, o navegador mostra o símbolo de "proibido" sempre que o mouse passa por
// fora de uma coluna durante o arrastar (a barra lateral, por exemplo) — mesmo que a
// intenção seja só passar por cima pra rolar até uma coluna escondida. Isso libera
// soltar em qualquer lugar da tela, mas só quando é de fato um card/coluna nosso
// sendo arrastado (não mexe em outros tipos de arrastar, tipo um arquivo do sistema).
function permitirDropForaDasColunas(e){
  const tipos = e.dataTransfer && e.dataTransfer.types;
  if(!tipos || (!tipos.includes('text/x-crm-card') && !tipos.includes('text/x-crm-column'))) return;
  if(e.target.closest('.column')) return; // já tratado pelo listener da própria coluna
  e.preventDefault();
  atualizarAutoScrollDoArrasto(e.clientX, e.clientY, null);
}
function atualizarAutoScrollDoArrasto(x, y, colAlvo){
  clearInterval(autoScrollDoArrastoInterval);
  const margemHorizontal = 260; // cobre a largura da barra lateral — passar por cima dela já conta como "quero rolar pra lá"
  const margemVertical = 110;
  const mainEl = document.querySelector('main.pipeline-main');
  let dxScroll = 0;
  if(mainEl){
    if(x < margemHorizontal) dxScroll = -16;
    else if(x > window.innerWidth - margemHorizontal) dxScroll = 16;
  }
  const colunaCardsEl = colAlvo ? colAlvo.querySelector('.cards') : null;
  let dyScroll = 0;
  if(colunaCardsEl){
    if(y < margemVertical) dyScroll = -12;
    else if(y > window.innerHeight - margemVertical) dyScroll = 12;
  }
  if(dxScroll===0 && dyScroll===0) return;
  autoScrollDoArrastoInterval = setInterval(()=>{
    if(mainEl && dxScroll) mainEl.scrollLeft += dxScroll;
    if(colunaCardsEl && dyScroll) colunaCardsEl.scrollTop += dyScroll;
  }, 16);
}
function finalizarArrastoDeCard(x, y){
  if(!cardTouchDrag) return;
  const colAlvo = encontrarColunaMaisProxima(x);
  const cardId = cardTouchDrag.cardId;
  limparVisualDoArrasto();
  if(colAlvo && colAlvo.dataset.colId){
    const ordem = calcularOrdemDeInsercao(colAlvo, y, cardId);
    moveCard(cardId, colAlvo.dataset.colId, ordem);
  }
}
function cancelarArrastoDeCard(){
  limparVisualDoArrasto();
}
function limparVisualDoArrasto(){
  if(!cardTouchDrag) return;
  clearInterval(autoScrollDoArrastoInterval);
  cardTouchDrag.cardEl.classList.remove('card-touch-arrastando');
  if(cardTouchDrag.fantasmaEl) cardTouchDrag.fantasmaEl.remove();
  document.querySelectorAll('.column.coluna-drag-alvo').forEach(c=> c.classList.remove('coluna-drag-alvo'));
  limparIndicadorDeInsercao();
}
function renderFloatingMoveMenu(){
  let root = document.getElementById('floating-menu-root');
  if(!root){
    root = document.createElement('div');
    root.id = 'floating-menu-root';
    document.body.appendChild(root);
  }
  if(!openMoveMenuCardId){ root.innerHTML = ''; return; }
  const btn = document.querySelector(`[data-action="toggle-move-menu"][data-card-id="${openMoveMenuCardId}"]`);
  const card = board.cards.find(c=>c.id===openMoveMenuCardId);
  if(!btn || !card){ root.innerHTML = ''; openMoveMenuCardId = null; return; }

  const colunasDoMesmoFunil = board.columns.filter(c=>c.funilId===funilAtualId);
  const rect = btn.getBoundingClientRect();
  const alturaEstimada = Math.min(260, colunasDoMesmoFunil.length * 40 + 40);
  const cabeDeBaixo = rect.bottom + alturaEstimada < window.innerHeight;
  const top = cabeDeBaixo ? rect.bottom + 4 : rect.top - alturaEstimada - 4;
  const left = Math.min(rect.left, window.innerWidth - 200); // não deixa vazar pela direita da tela

  root.innerHTML = `
    <div class="col-menu card-move-menu" style="position:fixed; top:${Math.max(4,top)}px; left:${Math.max(4,left)}px;">
      <div class="col-menu-title">Mover para</div>
      ${colunasDoMesmoFunil.map(c=>`
        <button class="col-menu-item" data-action="mover-para-coluna" data-card-id="${card.id}" data-col-id="${c.id}" ${c.id===card.columnId?'disabled':''}>
          ${esc(c.nome)} ${c.id===card.columnId?'✓':''}
        </button>
      `).join('')}
    </div>
  `;
  root.querySelectorAll('[data-action="mover-para-coluna"]').forEach(b=>{
    b.addEventListener('click', (e)=>{
      e.stopPropagation();
      if(b.disabled) return;
      openMoveMenuCardId = null;
      moveCard(b.dataset.cardId, b.dataset.colId);
    });
  });
}
function closeMenusOnOutsideClick(e){
  if(openMenuColId && !e.target.closest('.col-menu') && !e.target.closest('[data-action="toggle-col-menu"]')){
    openMenuColId = null; renderApp();
  }
  if(openMoveMenuCardId && !e.target.closest('.card-move-menu') && !e.target.closest('[data-action="toggle-move-menu"]')){
    openMoveMenuCardId = null; renderFloatingMoveMenu();
  }
  if(menuDiaAberto && !e.target.closest('#menu-dia-root')){
    fecharMenuDia();
  }
  if(dateMenuOpen && !e.target.closest('.date-menu') && !e.target.closest('[data-action="toggle-date-menu"]')){
    dateMenuOpen = false; renderApp();
  }
  if(notifOpen && !e.target.closest('.notif-panel') && !e.target.closest('[data-action="toggle-notif"]')){
    notifOpen = false; renderApp();
  }
  if(ordenarMenuAberto && !e.target.closest('.ordenar-wrap')){
    ordenarMenuAberto = null; renderApp();
  }
}

/* ---------- modal do cliente ---------- */
function openNewCard(columnId){
  const colId = columnId || ((board.columns.find(c=>c.tipo==='aberto') || board.columns[0] || {}).id);
  escolhaTipoPessoaColId = colId;
  renderEscolhaTipoPessoaModal();
}
function fecharEscolhaTipoPessoa(){
  escolhaTipoPessoaColId = null;
  document.getElementById('modal-root').innerHTML = '';
}
function renderEscolhaTipoPessoaModal(){
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="overlay" id="escolha-tipo-overlay">
      <div class="modal" style="max-width:380px;">
        <div class="modal-head">
          <h3>Novo lead</h3>
          <button id="escolha-tipo-close">✕</button>
        </div>
        <div class="modal-body" style="display:flex; flex-direction:column; gap:10px;">
          <button type="button" class="tipo-pessoa-escolha-btn" data-tipo="fisica">👤 Pessoa física</button>
          <button type="button" class="tipo-pessoa-escolha-btn" data-tipo="juridica">🏢 Pessoa jurídica</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('escolha-tipo-close').addEventListener('click', fecharEscolhaTipoPessoa);
  document.getElementById('escolha-tipo-overlay').addEventListener('click', (e)=>{ if(e.target.id==='escolha-tipo-overlay') fecharEscolhaTipoPessoa(); });
  root.querySelectorAll('.tipo-pessoa-escolha-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirNovoCardComTipo(escolhaTipoPessoaColId, btn.dataset.tipo));
  });
}
function abrirNovoCardComTipo(columnId, tipoPessoa){
  // se a pessoa estiver vendo um mês específico no Pipeline, começa nesse mês (dia 1);
  // se estiver em "Geral", usa a data de hoje mesmo, com o dia certinho
  const dataInicial = filterMonth ? `${filterMonth}-01` : new Date().toISOString().slice(0,10);
  modalForm = {
    __isNew: true, id:null, columnId,
    cliente:'', valor:0, temperatura:'morno', telefone:'', obs:'',
    mes: '', mesInicioContato: dataInicial, // início de contato já vem preenchido (é agora); mês de venda fica em branco até a venda acontecer de verdade
    etiquetas: [], camposPersonalizados: {}, tipoCarta: 'imovel',
    tipoPessoa, clienteFisica:'', clienteJuridica:'',
    cnpj:'', razaoSocial:'', inscricaoEstadual:'', ramoAtividade:'', contatoNome:'', contatoCargo:'',
  };
  tipoPessoaDropdownAberto = false;
  extrasTela = null; // sem isso, se a última coisa vista tivesse sido a tela de Extras
                      // de outro cliente, o formulário de novo lead nascia mostrando
                      // aquela tela por engano, em vez do formulário de verdade
  renderModal();
}
async function toggleArquivarCard(){
  if(!modalForm || modalForm.__isNew) return;
  const arquivarAgora = !modalForm.arquivado;
  try{
    const atualizado = await apiRequest('PUT', `/cards/${modalForm.id}/${arquivarAgora?'arquivar':'desarquivar'}`);
    const idx = board.cards.findIndex(c=>c.id===modalForm.id);
    if(idx>-1) board.cards[idx] = atualizado;
    if(arquivarAgora){
      closeModal();
      renderApp();
    } else {
      modalForm.arquivado = atualizado.arquivado;
      renderModal();
      renderApp();
    }
  }catch(e){
    errorMsg = 'Não foi possível atualizar o arquivamento.';
    renderApp();
  }
}
function openEditCard(id){
  const card = board.cards.find(c=>c.id===id);
  if(!card) return;
  modalForm = {
    ...card, __isNew:false,
    clienteFisica: card.tipoPessoa==='juridica' ? '' : (card.cliente||''),
    clienteJuridica: card.tipoPessoa==='juridica' ? (card.cliente||'') : '',
  };
  tipoPessoaDropdownAberto = false;
  notifOpen = false;
  extrasTela = null;
  etiquetaInputValor = '';
  etiquetaEditandoOriginal = null;
  anexosCarregados = false;
  anexosDoCard = [];
  anexoMsg = null;
  historicoContatoCarregado = false;
  historicoContatoItens = [];
  historicoContatoTexto = '';
  tarefasRapidasLista = [{ titulo:'', data:'' }];
  tarefaRapidaCriando = false;
  renderModal();
  loadAnexosDoCard(id);
  loadHistoricoContato(id);
}
function abrirMaisUmaLinhaDeTarefa(){
  tarefasRapidasLista.push({ titulo:'', data:'' });
  renderModal();
  const novoInput = document.querySelector(`.tarefa-rapida-titulo-input[data-idx="${tarefasRapidasLista.length-1}"]`);
  if(novoInput) novoInput.focus();
}
function removerLinhaDeTarefa(idx){
  if(tarefasRapidasLista.length <= 1) return; // sempre sobra pelo menos uma linha
  tarefasRapidasLista.splice(idx, 1);
  renderModal();
}
async function criarTarefaRapidaDoCard(){
  if(!modalForm || modalForm.__isNew) return;
  const validas = tarefasRapidasLista
    .map(t=> ({ titulo: t.titulo.trim(), data: t.data || new Date().toISOString().slice(0,10) }))
    .filter(t=> t.titulo);
  if(!validas.length) return;

  showConfirm({
    message: validas.length===1
      ? `Confirmar a criação da tarefa "${validas[0].titulo}"?`
      : `Confirmar a criação dessas ${validas.length} tarefas?`,
    confirmLabel: 'Confirmar',
    danger: false,
    onConfirm: async ()=>{
      closeConfirm();
      tarefaRapidaCriando = true;
      renderModal();
      try{
        for(const t of validas){
          const nova = await apiRequest('POST', '/tasks', { titulo: t.titulo, vencimento: t.data, prioridade:'media', leadId: modalForm.id, descricao:'' });
          tasks.push(nova);
          atualizarTarefaNaAgendaLocal(nova);
        }
        tarefaRapidaCriando = false;
        tarefasRapidasLista = [{ titulo:'', data:'' }]; // volta pro estado inicial — "segmento acima"
        renderModal();
        const dataMaisCedo = validas.map(t=>t.data).sort()[0];
        showConfirm({
          message: validas.length===1 ? 'Tarefa criada! Quer ir pra Agenda ver ela?' : 'Tarefas criadas! Quer ir pra Agenda ver elas?',
          confirmLabel: 'Ir pra Agenda',
          cancelLabel: 'Continuar aqui',
          danger: false,
          onConfirm: async ()=>{
            closeConfirm();
            closeModal();
            agendaMesAtual = dataMaisCedo.slice(0,7);
            goToPage('tarefas');
            await loadAgendaMes(agendaMesAtual);
            agendaDiaSelecionado = dataMaisCedo;
            agendaDiaDestacado = dataMaisCedo;
            renderAgendaDiaModal();
          },
        });
      }catch(e){
        errorMsg = 'Não foi possível criar as tarefas.';
        tarefaRapidaCriando = false;
        renderModal();
      }
    },
  });
}
function closeModal(){ modalForm = null; document.getElementById('modal-root').innerHTML=''; }

function renderExtrasOverlayHtml(f){
  let titulo = 'Extras';
  let voltarPara = null; // pra onde o botão de voltar leva — null fecha os Extras de vez
  let corpo = '';

  if(extrasTela === 'menu'){
    corpo = `
      <div class="extras-menu">
        <button type="button" class="extras-menu-btn" data-action="extras-ir" data-tela="etiquetas">🏷️<span>Etiquetas</span></button>
        <button type="button" class="extras-menu-btn" data-action="extras-ir" data-tela="anexos">📎<span>Anexos</span></button>
        <button type="button" class="extras-menu-btn" data-action="extras-ir" data-tela="tarefas">✅<span>Tarefas</span></button>
        <button type="button" class="extras-menu-btn" data-action="extras-ir" data-tela="historico">📞<span>Histórico</span></button>
      </div>
    `;
  } else if(extrasTela === 'etiquetas'){
    titulo = 'Etiquetas';
    voltarPara = 'menu';
    const etiquetas = f.etiquetas || [];
    corpo = `
      <div class="field-row-flex">
        <input type="text" id="etiqueta-input" value="${esc(etiquetaInputValor)}" placeholder="Nome da etiqueta" />
        <button type="button" class="btn-primary" id="etiqueta-salvar-btn">${etiquetaEditandoOriginal ? 'Salvar' : '+ Adicionar'}</button>
        ${etiquetaEditandoOriginal ? `<button type="button" class="btn-outline" id="etiqueta-cancelar-btn">Cancelar</button>` : ''}
      </div>
      ${etiquetas.length ? `
        <div class="etiquetas-pills" style="margin-top:14px;">
          ${etiquetas.map(et=>`
            <span class="etiqueta-pill etiqueta-pill-editavel">
              ${esc(et)}
              <button type="button" data-action="etiqueta-editar" data-etiqueta="${esc(et)}" title="Editar">✎</button>
              <button type="button" data-action="etiqueta-apagar" data-etiqueta="${esc(et)}" title="Apagar">✕</button>
            </span>
          `).join('')}
        </div>
      ` : '<p class="dash-empty">Nenhuma etiqueta ainda.</p>'}
    `;
  } else if(extrasTela === 'anexos'){
    titulo = 'Anexos';
    voltarPara = 'menu';
    corpo = `
      <input type="file" id="anexo-input" style="display:none;" accept="image/*,application/pdf" />
      <button type="button" class="btn-outline" id="anexo-upload-btn" ${anexoEnviando?'disabled':''}>${anexoEnviando?'Enviando…':'+ Adicionar anexo'}</button>
      <p class="settings-page-note">Imagens ou PDF, até ~3 MB por arquivo.</p>
      <div id="f-anexos-lista">${!anexosCarregados ? '<p class="settings-page-note">Carregando…</p>' : renderAnexosListaHtml()}</div>
    `;
  } else if(extrasTela === 'tarefas'){
    titulo = 'Tarefas';
    voltarPara = 'menu';
    const qtd = tasks.filter(t=>t.leadId===f.id).length;
    corpo = `
      <div class="field">
        <label>Nova(s) tarefa(s)</label>
        ${tarefasRapidasLista.map((t,i)=>`
          <div class="field-row-flex tarefa-rapida-linha">
            <input type="text" class="tarefa-rapida-titulo-input" data-idx="${i}" value="${esc(t.titulo)}" placeholder="Ex: Ligar amanhã de manhã" />
            <input type="date" class="tarefa-rapida-data-input" data-idx="${i}" value="${t.data || new Date().toISOString().slice(0,10)}" style="max-width:160px;" />
            ${i === tarefasRapidasLista.length-1
              ? `<button type="button" class="icon-btn" data-action="tarefa-rapida-add-linha" title="Adicionar outra tarefa">+</button>`
              : `<button type="button" class="icon-btn" data-action="tarefa-rapida-remover-linha" data-idx="${i}" title="Remover essa tarefa">✕</button>`
            }
          </div>
        `).join('')}
        <button type="button" class="btn-primary" style="width:100%; margin-top:8px;" id="tarefa-rapida-criar-btn" ${tarefaRapidaCriando?'disabled':''}>${tarefaRapidaCriando?'Criando…':'Confirmar'}</button>
      </div>
      <button type="button" class="btn-outline" style="width:100%;" data-action="extras-ir" data-tela="tarefas-lista">Ver tarefas existentes (${qtd})</button>
    `;
  } else if(extrasTela === 'tarefas-lista'){
    titulo = 'Tarefas existentes';
    voltarPara = 'tarefas';
    const tarefasDoLead = tasks.filter(t=>t.leadId===f.id).slice().sort((a,b)=> (a.vencimento||'').localeCompare(b.vencimento||''));
    corpo = tarefasDoLead.length ? `
      <div class="historico-lista">
        ${tarefasDoLead.map(t=>`
          <button type="button" class="historico-item historico-item-clicavel" data-action="extras-perguntar-conclusao-tarefa" data-task-id="${t.id}">
            <div style="flex:1; text-align:left;">
              <span class="historico-item-texto">${t.concluida?'✓ ':''}${esc(t.titulo)}</span>
              <span class="historico-item-data">${t.vencimento ? formatDate(t.vencimento) : 'Sem data'}</span>
            </div>
          </button>
        `).join('')}
      </div>
    ` : '<p class="dash-empty">Nenhuma tarefa ainda pra esse lead.</p>';
  } else if(extrasTela === 'historico'){
    titulo = 'Histórico de contato';
    voltarPara = 'menu';
    corpo = `
      <div class="field-row-flex">
        <input type="text" id="historico-input" value="${esc(historicoContatoTexto)}" placeholder="Ex: Tentei contato 3x hoje, cliente não atendeu" />
        <button type="button" class="btn-primary" id="historico-add-btn" ${historicoContatoEnviando?'disabled':''}>${historicoContatoEnviando?'Salvando…':'Adicionar'}</button>
      </div>
      <div id="f-historico-lista" style="margin-top:12px;">${!historicoContatoCarregado ? '<p class="settings-page-note">Carregando…</p>' : renderHistoricoContatoListaHtml()}</div>
    `;
  }

  return `
    <div class="overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <button id="extras-voltar" class="icon-btn" title="Voltar" data-voltar-para="${voltarPara||''}">←</button>
          <h3>${titulo}</h3>
          <button id="modal-close">✕</button>
        </div>
        <div class="modal-body">${corpo}</div>
      </div>
    </div>
  `;
}
function ligarBindingsExtras(){
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='modal-overlay') closeModal(); });
  const voltarBtn = document.getElementById('extras-voltar');
  if(voltarBtn) voltarBtn.addEventListener('click', ()=>{
    const para = voltarBtn.dataset.voltarPara;
    extrasTela = para || null; // sem "voltarPara" = fecha os Extras de vez, volta pro formulário
    etiquetaEditandoOriginal = null;
    etiquetaInputValor = '';
    renderModal();
  });
  app.querySelectorAll ? null : null; // (sem uso — mantém o padrão dos outros bindings do arquivo)

  document.querySelectorAll('[data-action="extras-ir"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ extrasTela = btn.dataset.tela; renderModal(); });
  });

  // Etiquetas
  const etiquetaInput = document.getElementById('etiqueta-input');
  if(etiquetaInput) etiquetaInput.addEventListener('input', (e)=> etiquetaInputValor = e.target.value);
  const etiquetaSalvarBtn = document.getElementById('etiqueta-salvar-btn');
  if(etiquetaSalvarBtn) etiquetaSalvarBtn.addEventListener('click', salvarEtiquetaExtras);
  const etiquetaCancelarBtn = document.getElementById('etiqueta-cancelar-btn');
  if(etiquetaCancelarBtn) etiquetaCancelarBtn.addEventListener('click', ()=>{
    etiquetaEditandoOriginal = null; etiquetaInputValor = ''; renderModal();
  });
  document.querySelectorAll('[data-action="etiqueta-editar"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      etiquetaEditandoOriginal = btn.dataset.etiqueta;
      etiquetaInputValor = btn.dataset.etiqueta;
      renderModal();
      const input = document.getElementById('etiqueta-input');
      if(input){ input.focus(); input.select(); }
    });
  });
  document.querySelectorAll('[data-action="etiqueta-apagar"]').forEach(btn=>{
    btn.addEventListener('click', ()=> apagarEtiquetaExtras(btn.dataset.etiqueta));
  });

  // Anexos (mesmo comportamento de antes, só que agora dentro dos Extras)
  const anexoInput = document.getElementById('anexo-input');
  const anexoUploadBtn = document.getElementById('anexo-upload-btn');
  if(anexoUploadBtn && anexoInput) anexoUploadBtn.addEventListener('click', ()=> anexoInput.click());
  if(anexoInput) anexoInput.addEventListener('change', (e)=>{
    const file = e.target.files && e.target.files[0];
    if(file) handleAnexoFileSelected(file);
  });

  // Tarefas
  document.querySelectorAll('.tarefa-rapida-titulo-input').forEach(input=>{
    input.addEventListener('input', (e)=>{ tarefasRapidasLista[Number(input.dataset.idx)].titulo = e.target.value; });
  });
  document.querySelectorAll('.tarefa-rapida-data-input').forEach(input=>{
    input.addEventListener('input', (e)=>{ tarefasRapidasLista[Number(input.dataset.idx)].data = e.target.value; });
  });
  const tarefaRapidaAddBtn = document.querySelector('[data-action="tarefa-rapida-add-linha"]');
  if(tarefaRapidaAddBtn) tarefaRapidaAddBtn.addEventListener('click', abrirMaisUmaLinhaDeTarefa);
  document.querySelectorAll('[data-action="tarefa-rapida-remover-linha"]').forEach(btn=>{
    btn.addEventListener('click', ()=> removerLinhaDeTarefa(Number(btn.dataset.idx)));
  });
  const tarefaRapidaCriarBtn = document.getElementById('tarefa-rapida-criar-btn');
  if(tarefaRapidaCriarBtn) tarefaRapidaCriarBtn.addEventListener('click', criarTarefaRapidaDoCard);
  document.querySelectorAll('[data-action="extras-perguntar-conclusao-tarefa"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const taskId = btn.dataset.taskId;
      const task = tasks.find(t=>t.id===taskId);
      if(!task) return;
      const mensagem = task.concluida
        ? `Marcar "${task.titulo}" como não concluída de novo?`
        : `A tarefa "${task.titulo}" foi concluída?`;
      showConfirm({
        message: mensagem,
        confirmLabel: task.concluida ? 'Desmarcar' : 'Concluída',
        danger: false,
        onConfirm: async ()=>{
          closeConfirm();
          await toggleTaskConcluida(taskId);
          if(extrasTela==='tarefas-lista') renderModal(); // atualiza a marcação (✓) na lista, já que renderApp() não mexe no modal
        },
      });
    });
  });

  // Histórico de contato
  const historicoInput = document.getElementById('historico-input');
  if(historicoInput){
    historicoInput.addEventListener('input', (e)=> historicoContatoTexto = e.target.value);
    historicoInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); adicionarHistoricoContato(); } });
  }
  const historicoAddBtn = document.getElementById('historico-add-btn');
  if(historicoAddBtn) historicoAddBtn.addEventListener('click', adicionarHistoricoContato);
  ligarBindingsHistoricoContato();
}
async function salvarEtiquetaExtras(){
  const novoValor = etiquetaInputValor.trim();
  if(!novoValor || !modalForm) return;
  const atuais = modalForm.etiquetas || [];
  let novasEtiquetas;
  if(etiquetaEditandoOriginal){
    novasEtiquetas = atuais.map(et=> et===etiquetaEditandoOriginal ? novoValor : et);
  } else {
    if(atuais.includes(novoValor)){ etiquetaInputValor=''; renderModal(); return; } // já existe, não duplica
    novasEtiquetas = [...atuais, novoValor];
  }
  await salvarEtiquetasNoCard(novasEtiquetas);
  etiquetaEditandoOriginal = null;
  etiquetaInputValor = '';
  renderModal();
}
async function apagarEtiquetaExtras(etiqueta){
  if(!modalForm) return;
  const novasEtiquetas = (modalForm.etiquetas||[]).filter(et=> et!==etiqueta);
  await salvarEtiquetasNoCard(novasEtiquetas);
  renderModal();
}
async function salvarEtiquetasNoCard(novasEtiquetas){
  const anteriores = modalForm.etiquetas || [];
  modalForm.etiquetas = novasEtiquetas; // otimista
  try{
    await apiRequest('PUT', `/cards/${modalForm.id}`, { etiquetas: novasEtiquetas });
    const card = board.cards.find(c=>c.id===modalForm.id);
    if(card) card.etiquetas = novasEtiquetas;
  }catch(e){
    modalForm.etiquetas = anteriores;
    errorMsg = 'Não foi possível salvar as etiquetas.';
  }
}

function renderModal(){
  const root = document.getElementById('modal-root');
  if(!modalForm){ root.innerHTML=''; return; }
  const f = modalForm;

  // Extras (etiquetas/anexos/tarefas/histórico) só faz sentido pra um card que já
  // existe de verdade — um card novo não tem id ainda pra buscar nada disso. Essa
  // checagem extra evita mostrar a tela de Extras por engano caso extrasTela tenha
  // ficado "grudado" de uma interação anterior com outro cliente.
  if(extrasTela && !f.__isNew){
    root.innerHTML = renderExtrasOverlayHtml(f);
    ligarBindingsExtras();
    return;
  }

  root.innerHTML = `
    <div class="overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>${f.__isNew ? 'Novo cliente' : 'Editar cliente'}</h3>
          <button id="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <button type="button" class="tipo-pessoa-select-btn" id="f-tipo-pessoa-select">
              <span>${f.tipoPessoa==='juridica' ? '🏢 Pessoa jurídica' : '👤 Pessoa física'}</span>
              <span class="tipo-pessoa-select-seta ${tipoPessoaDropdownAberto?'aberta':''}">▾</span>
            </button>
            ${tipoPessoaDropdownAberto ? `
              <div class="tipo-pessoa-dropdown">
                <button type="button" class="tipo-pessoa-dropdown-item" data-tipo-pessoa="fisica">👤 Pessoa física ${f.tipoPessoa!=='juridica'?'✓':''}</button>
                <button type="button" class="tipo-pessoa-dropdown-item" data-tipo-pessoa="juridica">🏢 Pessoa jurídica ${f.tipoPessoa==='juridica'?'✓':''}</button>
              </div>
            ` : ''}
          </div>
          <div class="field">
            <label>${f.tipoPessoa==='juridica' ? 'Nome fantasia' : 'Nome do cliente'}</label>
            <input type="text" id="f-cliente" value="${esc(f.tipoPessoa==='juridica' ? (f.clienteJuridica||'') : (f.clienteFisica||''))}" placeholder="${f.tipoPessoa==='juridica' ? 'Ex: Padaria do João' : 'Ex: Ana Souza'}" />
          </div>
          ${f.tipoPessoa==='juridica' ? `
            <div class="field-row">
              <div class="field">
                <label>CNPJ</label>
                <input type="text" id="f-cnpj" value="${esc(f.cnpj||'')}" placeholder="00.000.000/0000-00" />
              </div>
              <div class="field">
                <label>Inscrição estadual (opcional)</label>
                <input type="text" id="f-inscricao-estadual" value="${esc(f.inscricaoEstadual||'')}" placeholder="Isento ou número" />
              </div>
            </div>
            <div class="field">
              <label>Razão social</label>
              <input type="text" id="f-razao-social" value="${esc(f.razaoSocial||'')}" placeholder="Ex: Padaria do João Ltda" />
            </div>
            <div class="field">
              <label>Ramo de atividade</label>
              <input type="text" id="f-ramo-atividade" value="${esc(f.ramoAtividade||'')}" placeholder="Ex: Alimentação, Transporte, Varejo..." />
            </div>
            <div class="field-row">
              <div class="field">
                <label>Contato responsável</label>
                <input type="text" id="f-contato-nome" value="${esc(f.contatoNome||'')}" placeholder="Quem você fala na empresa" />
              </div>
              <div class="field">
                <label>Cargo do contato</label>
                <input type="text" id="f-contato-cargo" value="${esc(f.contatoCargo||'')}" placeholder="Ex: Sócio, Financeiro..." />
              </div>
            </div>
          ` : ''}
          <div class="field-row">
            <div class="field">
              <label>Valor de crédito</label>
              <div class="money-wrap">
                <span>R$</span>
                <input type="text" inputmode="numeric" id="f-valor" value="${f.valor ? Number(f.valor).toLocaleString('pt-BR') : ''}" placeholder="0" />
              </div>
            </div>
            <div class="field">
              <label>Coluna</label>
              <select id="f-coluna">
                ${board.columns.map(c=>`<option value="${c.id}" ${c.id===f.columnId?'selected':''}>${esc(c.nome)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field">
            <label>Tipo de carta de crédito</label>
            <select id="f-tipo-carta">
              ${renderOpcoesTipoCarta(f.tipoCarta||'imovel')}
            </select>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Mês de início de contato</label>
              <input type="date" id="f-mes-inicio-contato" value="${normalizarData(f.mesInicioContato)}" />
            </div>
            <div class="field">
              <label>Mês de venda</label>
              <input type="date" id="f-mes" value="${normalizarData(f.mes)}" />
            </div>
          </div>
          <p class="settings-page-note">O início de contato é opcional — ajuda a documentar quanto tempo leva até fechar.</p>
          <p class="settings-page-note" id="f-ciclo-venda-nota" style="${(f.mesInicioContato && !f.__isNew)?'':'display:none;'}">${textoCicloDeVenda(f.mesInicioContato, f.mes)}</p>
          <div class="field">
            <label>Qualificação</label>
            <div class="temp-toggle" id="f-temp-toggle">
              ${Object.entries(TEMPS).map(([key,t])=>`
                <div class="temp-btn ${f.temperatura===key ? 'active-'+key : ''}" data-temp="${key}">${t.emoji} ${t.label}</div>
              `).join('')}
            </div>
          </div>
          <div class="field">
            <label>Telefone (opcional)</label>
            <input type="text" id="f-telefone" value="${esc(f.telefone||'')}" placeholder="(11) 90000-0000" />
            <div class="wa-actions-row">
              <button type="button" class="wa-btn wa-btn-modal" id="f-whatsapp" style="${f.telefone ? '' : 'display:none;'}">
                ${WA_ICON} Abrir WhatsApp
              </button>
              ${!f.__isNew ? `<button type="button" class="ai-btn" id="f-ai-mensagem">${ICON_SPARKLE} Sugerir mensagem</button>` : ''}
              ${!f.__isNew && whatsappConnected ? `<button type="button" class="ai-btn" id="f-ver-conversa">${WA_ICON} Ver conversa</button>` : ''}
              ${!f.__isNew ? `<button type="button" class="ai-btn" id="f-ver-historico">🕘 Ver histórico</button>` : ''}
              ${!f.__isNew ? `<button type="button" class="ai-btn" id="f-gerar-proposta">📄 Gerar proposta</button>` : ''}
              ${!f.__isNew ? `<button type="button" class="ai-btn" id="f-toggle-arquivar">${f.arquivado?'📦 Desarquivar':'📦 Arquivar'}</button>` : ''}
            </div>
            <div class="ai-result" id="f-ai-mensagem-result" style="display:none;"></div>
            <div class="wa-conversa" id="f-wa-conversa" style="display:none;"></div>
            <div class="wa-conversa" id="f-historico" style="display:none;"></div>
          </div>
          <div class="field">
            <label>Observações (opcional)</label>
            <textarea id="f-obs" rows="3" placeholder="Detalhes da negociação...">${esc(f.obs||'')}</textarea>
            ${!f.__isNew ? `<button type="button" class="ai-btn" id="f-ai-tarefa">${ICON_SPARKLE} Sugerir tarefa de acompanhamento</button>` : ''}
            <div class="ai-result" id="f-ai-tarefa-result" style="display:none;"></div>
          </div>
          ${camposPersonalizados.map(campo=>`
            <div class="field">
              <label>${esc(campo.nome)}</label>
              <input type="${campo.tipo==='numero'?'number':(campo.tipo==='data'?'date':'text')}" class="f-campo-personalizado" data-campo-id="${campo.id}" value="${esc(((f.camposPersonalizados||{})[campo.id])||'')}" />
            </div>
          `).join('')}
          ${!f.__isNew ? `
            <div class="field">
              <button type="button" class="btn-outline" id="f-abrir-extras" style="width:100%;">⋯ Extras (etiquetas, anexos, tarefas, histórico)</button>
            </div>
          ` : ''}
          ${!f.__isNew && f.sugestaoIA && f.sugestaoIA.texto ? `
            <div class="field">
              <div class="ai-result" style="display:block;">
                <p class="settings-page-subtitle">✨ Sugestão da IA proativa</p>
                <p>${esc(f.sugestaoIA.texto)}</p>
                ${f.sugestaoIA.tarefaTitulo ? `<p class="settings-page-note">Tarefa sugerida: <b>${esc(f.sugestaoIA.tarefaTitulo)}</b> (${f.sugestaoIA.tarefaDias||3} dia(s))</p>` : ''}
                <div class="ai-result-actions">
                  <button type="button" class="btn-outline" id="f-sugestao-copiar">Copiar mensagem</button>
                  ${f.sugestaoIA.tarefaTitulo ? `<button type="button" class="btn-outline" id="f-sugestao-criar-tarefa">Criar tarefa sugerida</button>` : ''}
                  <button type="button" class="btn-outline" id="f-sugestao-descartar">Descartar</button>
                </div>
              </div>
            </div>
          ` : ''}
        </div>
        <div class="modal-foot">
          ${!f.__isNew ? `<button class="delete-link" id="f-delete">🗑 Excluir</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            ${mensagemSalvoCard ? `<span class="mensagem-salvo-toast">${esc(mensagemSalvoCard)}</span>` : ''}
            <button class="btn-outline" id="f-cancel" ${salvandoCard?'disabled':''}>Cancelar</button>
            <button class="btn-save" id="f-save" ${salvandoCard?'disabled':''}>${salvandoCard?'Salvando…':'Salvar'}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('f-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='modal-overlay') closeModal(); });

  document.getElementById('f-cliente').addEventListener('input', (e)=>{
    if(modalForm.tipoPessoa==='juridica') modalForm.clienteJuridica = e.target.value;
    else modalForm.clienteFisica = e.target.value;
  });
  const telefoneInput = document.getElementById('f-telefone');
  const waModalBtn = document.getElementById('f-whatsapp');
  telefoneInput.addEventListener('input', (e)=>{
    modalForm.telefone = e.target.value;
    waModalBtn.style.display = e.target.value.trim() ? 'inline-flex' : 'none';
  });
  waModalBtn.addEventListener('click', ()=> abrirWhatsapp(modalForm.telefone));
  document.getElementById('f-obs').addEventListener('input', (e)=> modalForm.obs = e.target.value);
  document.querySelectorAll('.f-campo-personalizado').forEach(el=>{
    el.addEventListener('input', (e)=>{
      if(!modalForm.camposPersonalizados) modalForm.camposPersonalizados = {};
      modalForm.camposPersonalizados[el.dataset.campoId] = e.target.value;
    });
  });
  const abrirExtrasBtn = document.getElementById('f-abrir-extras');
  if(abrirExtrasBtn) abrirExtrasBtn.addEventListener('click', ()=>{ extrasTela = 'menu'; renderModal(); });
  const aiMensagemBtn = document.getElementById('f-ai-mensagem');
  if(aiMensagemBtn) aiMensagemBtn.addEventListener('click', sugerirMensagemIA);
  const aiTarefaBtn = document.getElementById('f-ai-tarefa');
  if(aiTarefaBtn) aiTarefaBtn.addEventListener('click', sugerirTarefaIA);
  const sugestaoCopiarBtn = document.getElementById('f-sugestao-copiar');
  if(sugestaoCopiarBtn) sugestaoCopiarBtn.addEventListener('click', ()=>{
    navigator.clipboard.writeText(modalForm.sugestaoIA.texto).catch(()=>{});
  });
  const sugestaoCriarTarefaBtn = document.getElementById('f-sugestao-criar-tarefa');
  if(sugestaoCriarTarefaBtn) sugestaoCriarTarefaBtn.addEventListener('click', async ()=>{
    sugestaoCriarTarefaBtn.disabled = true;
    try{
      const venc = new Date();
      venc.setDate(venc.getDate() + (modalForm.sugestaoIA.tarefaDias||3));
      const nova = await apiRequest('POST', '/tasks', {
        titulo: modalForm.sugestaoIA.tarefaTitulo, vencimento: venc.toISOString().slice(0,10),
        prioridade:'media', leadId: modalForm.id, descricao:'',
      });
      tasks.push(nova);
      sugestaoCriarTarefaBtn.textContent = '✓ Tarefa criada';
    }catch(e){
      errorMsg = 'Não foi possível criar a tarefa.';
      renderApp();
    }
  });
  const sugestaoDescartarBtn = document.getElementById('f-sugestao-descartar');
  if(sugestaoDescartarBtn) sugestaoDescartarBtn.addEventListener('click', async ()=>{
    try{
      const atualizado = await apiRequest('DELETE', `/cards/${modalForm.id}/sugestao-ia`);
      const idx = board.cards.findIndex(c=>c.id===modalForm.id);
      if(idx>-1) board.cards[idx] = atualizado;
      modalForm.sugestaoIA = atualizado.sugestaoIA;
      renderModal();
    }catch(e){
      errorMsg = 'Não foi possível descartar a sugestão.';
      renderApp();
    }
  });
  const verConversaBtn = document.getElementById('f-ver-conversa');
  if(verConversaBtn) verConversaBtn.addEventListener('click', abrirConversaWhatsapp);
  const verHistoricoBtn = document.getElementById('f-ver-historico');
  if(verHistoricoBtn) verHistoricoBtn.addEventListener('click', abrirHistoricoCard);
  const gerarPropostaBtn = document.getElementById('f-gerar-proposta');
  if(gerarPropostaBtn) gerarPropostaBtn.addEventListener('click', abrirPropostaModal);
  const toggleArquivarBtn = document.getElementById('f-toggle-arquivar');
  if(toggleArquivarBtn) toggleArquivarBtn.addEventListener('click', toggleArquivarCard);
  document.getElementById('f-coluna').addEventListener('change', (e)=> modalForm.columnId = e.target.value);
  const tipoCartaEl = document.getElementById('f-tipo-carta');
  if(tipoCartaEl) tipoCartaEl.addEventListener('change', (e)=> modalForm.tipoCarta = e.target.value);
  document.getElementById('f-mes').addEventListener('change', (e)=>{
    modalForm.mes = e.target.value;
    atualizarNotaCicloDeVenda();
  });
  const mesInicioContatoInput = document.getElementById('f-mes-inicio-contato');
  if(mesInicioContatoInput) mesInicioContatoInput.addEventListener('change', (e)=>{
    modalForm.mesInicioContato = e.target.value;
    atualizarNotaCicloDeVenda();
  });

  const valorInput = document.getElementById('f-valor');
  valorInput.addEventListener('input', (e)=>{
    const { numero, texto } = maskInteiro(e.target.value);
    modalForm.valor = numero;
    e.target.value = texto;
  });

  document.querySelectorAll('#f-temp-toggle .temp-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      modalForm.temperatura = btn.dataset.temp;
      document.querySelectorAll('#f-temp-toggle .temp-btn').forEach(b=>{
        b.className = 'temp-btn' + (b.dataset.temp===modalForm.temperatura ? ' active-'+b.dataset.temp : '');
      });
    });
  });

  document.getElementById('f-tipo-pessoa-select').addEventListener('click', ()=>{
    tipoPessoaDropdownAberto = !tipoPessoaDropdownAberto;
    renderModal();
  });
  document.querySelectorAll('.tipo-pessoa-dropdown-item').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      modalForm.tipoPessoa = btn.dataset.tipoPessoa;
      tipoPessoaDropdownAberto = false;
      renderModal(); // precisa redesenhar pra mostrar/esconder os campos de empresa
    });
  });
  const cnpjInput = document.getElementById('f-cnpj');
  if(cnpjInput) cnpjInput.addEventListener('input', (e)=> modalForm.cnpj = e.target.value);
  const razaoSocialInput = document.getElementById('f-razao-social');
  if(razaoSocialInput) razaoSocialInput.addEventListener('input', (e)=> modalForm.razaoSocial = e.target.value);
  const inscricaoEstadualInput = document.getElementById('f-inscricao-estadual');
  if(inscricaoEstadualInput) inscricaoEstadualInput.addEventListener('input', (e)=> modalForm.inscricaoEstadual = e.target.value);
  const ramoAtividadeInput = document.getElementById('f-ramo-atividade');
  if(ramoAtividadeInput) ramoAtividadeInput.addEventListener('input', (e)=> modalForm.ramoAtividade = e.target.value);
  const contatoNomeInput = document.getElementById('f-contato-nome');
  if(contatoNomeInput) contatoNomeInput.addEventListener('input', (e)=> modalForm.contatoNome = e.target.value);
  const contatoCargoInput = document.getElementById('f-contato-cargo');
  if(contatoCargoInput) contatoCargoInput.addEventListener('input', (e)=> modalForm.contatoCargo = e.target.value);

  document.getElementById('f-save').addEventListener('click', saveCardFromModal);
  if(!f.__isNew){
    document.getElementById('f-delete').addEventListener('click', ()=>{
      showConfirm({
        message: 'Excluir este cliente do funil? Essa ação não pode ser desfeita.',
        onConfirm: ()=>{ deleteCardById(f.id); closeModal(); closeConfirm(); },
      });
    });
  }
}

/* ---------- modal da tarefa ---------- */
function openNewTask(dataPreenchida, horaPreenchida){
  taskModalForm = { __isNew:true, id:null, titulo:'', vencimento: dataPreenchida||'', hora: horaPreenchida||'', prioridade:'media', leadId:'', descricao:'' };
  renderTaskModal();
}
function openEditTask(id){
  const t = tasks.find(x=>x.id===id);
  if(!t) return;
  let hora = '';
  let dataStr = '';
  if(t.vencimento){
    const d = new Date(t.vencimento);
    if(!isNaN(d.getTime())){
      // Usa hora em UTC (não local) pra checar se tem horário definido: tarefa sem hora
      // é salva como meia-noite UTC — em horário local (Brasil, UTC-3) isso apareceria
      // como "21:00 do dia anterior" se checássemos em hora local, o que é errado.
      const temHora = d.getUTCHours()!==0 || d.getUTCMinutes()!==0;
      if(temHora){
        // Tem horário de verdade: usa data E hora em horário LOCAL, já que foi isso
        // que a pessoa digitou (senão uma tarefa de 23h vira o dia seguinte por causa do UTC).
        hora = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        dataStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      } else {
        // Sem horário (só data) — o valor já é meia-noite UTC, pega a data direto da string.
        dataStr = t.vencimento.slice(0,10);
      }
    }
  }
  taskModalForm = { ...t, __isNew:false, vencimento: dataStr, hora, leadId: t.leadId || '' };
  renderTaskModal();
}
function closeTaskModal(){
  taskModalForm = null;
  if(agendaDiaSelecionado){ renderAgendaDiaModal(); return; }
  document.getElementById('modal-root').innerHTML='';
}

/* ---------- modal: Editar perfil (escolha entre adicionar foto / editar nome) ---------- */
function abrirEditarPerfilModal(){
  modalEditarPerfilAberto = true;
  renderEditarPerfilModal();
}
function closeEditarPerfilModal(){
  modalEditarPerfilAberto = false;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function renderEditarPerfilModal(){
  const root = document.getElementById('modal-root');
  if(!modalEditarPerfilAberto){ root.innerHTML=''; return; }
  const temFoto = !!(currentUser && currentUser.avatarUrl);
  root.innerHTML = `
    <div class="overlay" id="editar-perfil-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Editar perfil</h3>
          <button id="editar-perfil-close">✕</button>
        </div>
        <div class="modal-body">
          <button type="button" class="opcao-perfil-btn" data-action="editar-perfil-foto">
            <span class="opcao-perfil-icon">${ICON_CAMERA}</span>
            <span>
              <strong>${temFoto?'Trocar foto':'Adicionar foto'}</strong>
              <span class="opcao-perfil-nota">PNG, JPG ou WebP — redimensionamos automaticamente.</span>
            </span>
          </button>
          <button type="button" class="opcao-perfil-btn" data-action="editar-perfil-nome">
            <span class="opcao-perfil-icon">${ICON_EDIT}</span>
            <span>
              <strong>Editar nome</strong>
              <span class="opcao-perfil-nota">Como seu nome aparece pro resto da equipe.</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('editar-perfil-close').addEventListener('click', closeEditarPerfilModal);
  document.getElementById('editar-perfil-overlay').addEventListener('click', (e)=>{ if(e.target.id==='editar-perfil-overlay') closeEditarPerfilModal(); });
  document.querySelector('[data-action="editar-perfil-foto"]').addEventListener('click', ()=>{
    closeEditarPerfilModal();
    const input = document.getElementById('avatar-input');
    if(input) input.click();
  });
  document.querySelector('[data-action="editar-perfil-nome"]').addEventListener('click', ()=>{
    closeEditarPerfilModal();
    abrirAlterarNomeModal();
  });
}

/* ---------- visualização grande da foto (toque-e-segure no avatar) ---------- */
function abrirAvatarLightbox(){
  if(!(currentUser && currentUser.avatarUrl)) return;
  avatarLightboxAberto = true;
  renderAvatarLightbox();
}
function closeAvatarLightbox(){
  avatarLightboxAberto = false;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function renderAvatarLightbox(){
  const root = document.getElementById('modal-root');
  if(!avatarLightboxAberto){ root.innerHTML=''; return; }
  root.innerHTML = `
    <div class="overlay avatar-lightbox-overlay" id="avatar-lightbox-overlay">
      <img src="${currentUser.avatarUrl}" alt="Foto de perfil" class="avatar-lightbox-img" />
      <button id="avatar-lightbox-close" class="avatar-lightbox-close" title="Fechar">✕</button>
    </div>
  `;
  document.getElementById('avatar-lightbox-close').addEventListener('click', closeAvatarLightbox);
  document.getElementById('avatar-lightbox-overlay').addEventListener('click', (e)=>{ if(e.target.id==='avatar-lightbox-overlay') closeAvatarLightbox(); });
}

function abrirAlterarNomeModal(){
  nomeNovoVal = (currentUser && currentUser.nome) || '';
  nomeMsg = null;
  modalAlterarNomeAberto = true;
  renderAlterarNomeModal();
}
function closeAlterarNomeModal(){
  modalAlterarNomeAberto = false;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function renderAlterarNomeModal(){
  const root = document.getElementById('modal-root');
  if(!modalAlterarNomeAberto){ root.innerHTML=''; return; }
  root.innerHTML = `
    <div class="overlay" id="alterar-nome-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Alterar nome</h3>
          <button id="alterar-nome-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Nome</label>
            <input type="text" id="s-nome" value="${esc(nomeNovoVal)}" placeholder="Seu nome" />
          </div>
          ${nomeMsg ? `<p class="settings-page-msg ${nomeMsg.tipo}">${esc(nomeMsg.texto)}</p>` : ''}
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="alterar-nome-cancelar">Cancelar</button>
            <button class="btn-save" id="s-nome-salvar" ${nomeSalvando?'disabled':''}>${nomeSalvando?'Salvando…':'Salvar'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('alterar-nome-close').addEventListener('click', closeAlterarNomeModal);
  document.getElementById('alterar-nome-cancelar').addEventListener('click', closeAlterarNomeModal);
  document.getElementById('alterar-nome-overlay').addEventListener('click', (e)=>{ if(e.target.id==='alterar-nome-overlay') closeAlterarNomeModal(); });
  document.getElementById('s-nome').addEventListener('input', (e)=> nomeNovoVal = e.target.value);
  document.getElementById('s-nome-salvar').addEventListener('click', salvarNome);
}

function abrirAlterarSenhaModal(){
  senhaAtualVal = '';
  senhaNovaVal = '';
  senhaMsg = null;
  modalAlterarSenhaAberto = true;
  renderAlterarSenhaModal();
}
function closeAlterarSenhaModal(){
  modalAlterarSenhaAberto = false;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function renderAlterarSenhaModal(){
  const root = document.getElementById('modal-root');
  if(!modalAlterarSenhaAberto){ root.innerHTML=''; return; }
  root.innerHTML = `
    <div class="overlay" id="alterar-senha-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Mudar senha</h3>
          <button id="alterar-senha-close">✕</button>
        </div>
        <div class="modal-body">
          ${currentUser && !currentUser.temSenha ? `
            <p class="settings-page-note">Esta conta ainda não tem senha (entra só com o Google). Você pode definir uma agora, se quiser.</p>
          ` : ''}
          <div class="field">
            <label>Senha atual</label>
            <input type="password" id="s-senha-atual" value="${esc(senhaAtualVal)}" placeholder="Deixe em branco se ainda não tem senha" />
          </div>
          <div class="field">
            <label>Nova senha</label>
            <input type="password" id="s-senha-nova" value="${esc(senhaNovaVal)}" placeholder="Mínimo 6 caracteres" />
          </div>
          ${senhaMsg ? `<p class="settings-page-msg ${senhaMsg.tipo}">${esc(senhaMsg.texto)}</p>` : ''}
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="alterar-senha-cancelar">Cancelar</button>
            <button class="btn-save" id="s-senha-salvar" ${senhaSalvando?'disabled':''}>${senhaSalvando?'Salvando…':'Salvar'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('alterar-senha-close').addEventListener('click', closeAlterarSenhaModal);
  document.getElementById('alterar-senha-cancelar').addEventListener('click', closeAlterarSenhaModal);
  document.getElementById('alterar-senha-overlay').addEventListener('click', (e)=>{ if(e.target.id==='alterar-senha-overlay') closeAlterarSenhaModal(); });
  document.getElementById('s-senha-atual').addEventListener('input', (e)=> senhaAtualVal = e.target.value);
  document.getElementById('s-senha-nova').addEventListener('input', (e)=> senhaNovaVal = e.target.value);
  document.getElementById('s-senha-salvar').addEventListener('click', salvarSenha);
}

// Abre a edição de um evento do Google Agenda — diferente de editar uma tarefa,
// isso muda o evento de verdade, direto na fonte (no seu Google Agenda).
function excluirTudoDoDia(diaISO, tarefasDoDia, eventosDoDia){
  const total = tarefasDoDia.length + eventosDoDia.length;
  if(!total) return;
  const temEventos = eventosDoDia.length > 0;
  showConfirm({
    message: `Excluir ${total} item${total===1?'':'s'} desse dia?${temEventos ? ' Isso inclui excluir evento(s) direto do seu Google Agenda de verdade, não só daqui.' : ''} Essa ação não pode ser desfeita.`,
    onConfirm: async ()=>{
      closeConfirm();
      closeAgendaDiaModal();
      for(const t of tarefasDoDia){
        try{
          await apiRequest('DELETE', `/tasks/${t.id}`);
          const idx = tasks.findIndex(x=>x.id===t.id);
          if(idx>-1) tasks.splice(idx,1);
        }catch(e){ /* segue tentando os outros mesmo se um falhar */ }
      }
      agendaTarefas = agendaTarefas.filter(x => !tarefasDoDia.some(t=>t.id===x.id));
      for(const e of eventosDoDia){
        try{
          await apiRequest('DELETE', `/calendar/eventos/${e.id}`);
        }catch(err){ /* segue tentando os outros mesmo se um falhar */ }
      }
      agendaEventosGoogle = agendaEventosGoogle.filter(x => !eventosDoDia.some(e=>e.id===x.id));
      renderApp();
    },
  });
}
function openEditEventoGoogle(eventId){
  const e = agendaEventosGoogle.find(x=>x.id===eventId);
  if(!e) return;
  let data = '', hora = '';
  if(e.inicio){
    if(e.diaInteiro){
      data = e.inicio.slice(0,10);
    } else {
      const d = new Date(e.inicio);
      data = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      hora = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }
  }
  eventoGoogleModalForm = { eventId, titulo: e.titulo, data, hora, descricao: e.descricao||'', prioridade: e.prioridade||'media', leadId: e.leadId||'' };
  renderEventoGoogleModal();
}
function closeEventoGoogleModal(){ eventoGoogleModalForm = null; document.getElementById('modal-root').innerHTML=''; }
async function salvarEventoGoogle(){
  const f = eventoGoogleModalForm;
  if(!f || !f.titulo.trim()) return;
  try{
    await apiRequest('PUT', `/calendar/eventos/${f.eventId}`, { titulo: f.titulo, data: f.data, hora: f.hora || null, descricao: f.descricao, prioridade: f.prioridade, leadId: f.leadId || null });
    const idx = agendaEventosGoogle.findIndex(x=>x.id===f.eventId);
    if(idx>-1){
      const novoInicio = f.hora ? new Date(`${f.data}T${f.hora}`).toISOString() : f.data;
      const card = f.leadId ? board.cards.find(c=>c.id===f.leadId) : null;
      agendaEventosGoogle[idx] = { ...agendaEventosGoogle[idx], titulo:f.titulo, inicio:novoInicio, diaInteiro: !f.hora, descricao:f.descricao, prioridade:f.prioridade, leadId:f.leadId||null, clienteNome: card ? card.cliente : null };
    }
    closeEventoGoogleModal();
    renderApp();
  }catch(e){
    errorMsg = e.message || 'Não foi possível salvar o evento no Google Agenda.';
    renderApp();
  }
}
function excluirEventoGoogle(){
  const f = eventoGoogleModalForm;
  if(!f) return;
  showConfirm({
    message: 'Excluir este evento do Google Agenda? Ele será removido de verdade, na sua conta do Google — não só daqui.',
    onConfirm: async ()=>{
      closeConfirm();
      try{
        await apiRequest('DELETE', `/calendar/eventos/${f.eventId}`);
        agendaEventosGoogle = agendaEventosGoogle.filter(x=>x.id!==f.eventId);
        closeEventoGoogleModal();
        renderApp();
      }catch(e){
        errorMsg = e.message || 'Não foi possível excluir o evento.';
        renderApp();
      }
    },
  });
}
function renderEventoGoogleModal(){
  const root = document.getElementById('modal-root');
  if(!eventoGoogleModalForm){ root.innerHTML=''; return; }
  const f = eventoGoogleModalForm;

  root.innerHTML = `
    <div class="overlay" id="evento-google-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>📅 Editar evento do Google Agenda</h3>
          <button id="evento-google-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Título</label>
            <input type="text" id="eg-titulo" value="${esc(f.titulo)}" placeholder="Ex: Ligar para cliente" />
          </div>
          <div class="field-row">
            <div class="field">
              <label>Data</label>
              <input type="date" id="eg-data" value="${f.data}" />
            </div>
            <div class="field">
              <label>Hora (opcional)</label>
              <input type="time" id="eg-hora" value="${f.hora}" />
            </div>
            <div class="field">
              <label>Prioridade</label>
              <select id="eg-prioridade">
                ${Object.entries(PRIORIDADES).map(([key,p])=>`<option value="${key}" ${f.prioridade===key?'selected':''}>${p.label}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field">
            <label>Lead relacionado</label>
            <select id="eg-lead">
              <option value="">Sem lead</option>
              ${board.cards.map(c=>`<option value="${c.id}" ${f.leadId===c.id?'selected':''}>${esc(c.cliente) || 'Sem nome'}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Descrição</label>
            <textarea id="eg-descricao" rows="3" placeholder="Detalhes do evento...">${esc(f.descricao||'')}</textarea>
          </div>
          <p class="settings-page-note">Título, data, hora e descrição mudam o evento de verdade, direto no seu Google Agenda. Prioridade e lead relacionado são exclusivos daqui do CRM — o Google não tem esses campos, então ficam guardados só aqui, amarrados a esse evento.</p>
        </div>
        <div class="modal-foot">
          <button class="delete-link" id="eg-delete">🗑 Excluir</button>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="eg-cancel">Cancelar</button>
            <button class="btn-save" id="eg-save">Salvar evento</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('evento-google-modal-close').addEventListener('click', closeEventoGoogleModal);
  document.getElementById('eg-cancel').addEventListener('click', closeEventoGoogleModal);
  document.getElementById('evento-google-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='evento-google-modal-overlay') closeEventoGoogleModal(); });
  document.getElementById('eg-titulo').addEventListener('input', (e)=> eventoGoogleModalForm.titulo = e.target.value);
  document.getElementById('eg-data').addEventListener('change', (e)=> eventoGoogleModalForm.data = e.target.value);
  document.getElementById('eg-hora').addEventListener('change', (e)=> eventoGoogleModalForm.hora = e.target.value);
  document.getElementById('eg-prioridade').addEventListener('change', (e)=> eventoGoogleModalForm.prioridade = e.target.value);
  document.getElementById('eg-lead').addEventListener('change', (e)=> eventoGoogleModalForm.leadId = e.target.value);
  document.getElementById('eg-descricao').addEventListener('input', (e)=> eventoGoogleModalForm.descricao = e.target.value);
  document.getElementById('eg-save').addEventListener('click', salvarEventoGoogle);
  document.getElementById('eg-delete').addEventListener('click', excluirEventoGoogle);
}
function renderTaskModal(){
  const root = document.getElementById('modal-root');
  if(!taskModalForm){ root.innerHTML=''; return; }
  const f = taskModalForm;

  root.innerHTML = `
    <div class="overlay" id="task-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>${f.__isNew ? 'Nova tarefa' : 'Editar tarefa'}</h3>
          <button id="task-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Título</label>
            <input type="text" id="t-titulo" value="${esc(f.titulo)}" placeholder="Ex: Ligar para cliente" />
          </div>
          <div class="field-row">
            <div class="field">
              <label>Vencimento</label>
              <input type="date" id="t-vencimento" value="${f.vencimento||''}" />
            </div>
            <div class="field">
              <label>Hora (opcional)</label>
              <input type="time" id="t-hora" value="${f.hora||''}" />
            </div>
            <div class="field">
              <label>Prioridade</label>
              <select id="t-prioridade">
                ${Object.entries(PRIORIDADES).map(([key,p])=>`<option value="${key}" ${f.prioridade===key?'selected':''}>${p.label}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field">
            <label>Lead relacionado</label>
            <select id="t-lead">
              <option value="">Sem lead</option>
              ${board.cards.map(c=>`<option value="${c.id}" ${f.leadId===c.id?'selected':''}>${esc(c.cliente) || 'Sem nome'}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Descrição</label>
            <textarea id="t-descricao" rows="3" placeholder="Detalhes da tarefa...">${esc(f.descricao||'')}</textarea>
          </div>
        </div>
        <div class="modal-foot">
          ${!f.__isNew ? `<button class="delete-link" id="t-delete">🗑 Excluir</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            <button class="btn-outline" id="t-cancel" ${salvandoTask?'disabled':''}>Cancelar</button>
            <button class="btn-save" id="t-save" ${salvandoTask?'disabled':''}>${salvandoTask?'Salvando…':'Salvar tarefa'}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('task-modal-close').addEventListener('click', closeTaskModal);
  document.getElementById('t-cancel').addEventListener('click', closeTaskModal);
  document.getElementById('task-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='task-modal-overlay') closeTaskModal(); });

  document.getElementById('t-titulo').addEventListener('input', (e)=> taskModalForm.titulo = e.target.value);
  document.getElementById('t-vencimento').addEventListener('change', (e)=> taskModalForm.vencimento = e.target.value);
  document.getElementById('t-hora').addEventListener('change', (e)=> taskModalForm.hora = e.target.value);
  document.getElementById('t-prioridade').addEventListener('change', (e)=> taskModalForm.prioridade = e.target.value);
  document.getElementById('t-lead').addEventListener('change', (e)=> taskModalForm.leadId = e.target.value);
  document.getElementById('t-descricao').addEventListener('input', (e)=> taskModalForm.descricao = e.target.value);

  document.getElementById('t-save').addEventListener('click', saveTaskFromModal);
  if(!f.__isNew){
    document.getElementById('t-delete').addEventListener('click', ()=>{
      showConfirm({
        message: 'Excluir esta tarefa? Essa ação não pode ser desfeita.',
        onConfirm: ()=>{ deleteTaskById(f.id); closeTaskModal(); closeConfirm(); },
      });
    });
  }
}

/* ---------- página: Conversas ---------- */
function renderConversasPage(){
  if(!conversasLoaded){
    return `<div class="page-head"><div><h1>Conversas</h1><p>Carregando…</p></div></div>`;
  }
  if(!whatsappConnected){
    return `
      <div class="page-head"><div><h1>Conversas</h1><p>Nenhuma conversa ainda</p></div></div>
      <div class="tasks-empty">Conecte o WhatsApp Business em Configurações → Integrações para ver as conversas aqui.</div>
    `;
  }
  const busca = conversaBusca.trim().toLowerCase();
  const listaFiltrada = busca ? conversas.filter(cv=> (cv.card.cliente||'').toLowerCase().includes(busca) || (cv.card.telefone||'').includes(busca)) : conversas;
  const card = conversaSelecionadaCardId ? board.cards.find(c=>c.id===conversaSelecionadaCardId) : null;
  const automacoesRelevantes = card ? automacoes.filter(a=>a.colunaGatilhoId===card.columnId && a.ativa!==false) : [];

  return `
    <div class="page-head">
      <div>
        <h1>Conversas</h1>
        <p>${conversas.length} conversa${conversas.length===1?'':'s'} no WhatsApp</p>
      </div>
      <div class="page-head-actions">
        <button class="btn-outline" data-action="abrir-overlay-conversas" data-overlay="automacoes">⚡ Automações</button>
        <button class="btn-outline" data-action="abrir-overlay-conversas" data-overlay="disparos">📣 Disparos</button>
        <button class="btn-outline" data-action="abrir-overlay-conversas" data-overlay="agendamentos">🕐 Agendar Mensagem</button>
      </div>
    </div>
    <div class="conversas-3col">
      <div class="conversas-col-lista">
        <input type="text" class="conversas-busca" id="conversas-busca-input" placeholder="Buscar por nome ou telefone…" value="${esc(conversaBusca)}" />
        <div class="conversas-lista-scroll">
          ${listaFiltrada.length ? listaFiltrada.map(cv=>`
            <div class="conversa-item ${conversaSelecionadaCardId===cv.card.id?'conversa-item-ativa':''}" data-action="selecionar-conversa" data-card-id="${cv.card.id}">
              <div class="conversa-item-main">
                <span class="conversa-item-nome">${cv.canal==='instagram'?'📷':'💬'} ${esc(cv.card.cliente) || 'Sem nome'}</span>
                <span class="conversa-item-preview">${cv.direcaoUltima==='out' ? 'Você: ' : ''}${esc((cv.ultimaMensagem||'').slice(0,60))}</span>
              </div>
              <span class="conversa-item-hora">${formatDateHora(cv.ultimaMensagemEm)}</span>
            </div>
          `).join('') : `<p class="dash-empty" style="padding:16px;">Nenhuma conversa encontrada.</p>`}
        </div>
      </div>

      <div class="conversas-col-chat">
        ${!card ? `
          <div class="conversas-vazio">Escolha uma conversa à esquerda pra começar.</div>
        ` : `
          <div class="conversas-chat-head">
            <span class="conversa-item-nome">${esc(card.cliente)||'Sem nome'}</span>
            <span class="settings-page-note">${esc(card.telefone||'')}</span>
          </div>
          ${!conversaMensagensLoaded ? `<p class="settings-page-note" style="padding:16px;">Carregando conversa…</p>` : `
            <div class="wa-conversa-lista conversas-chat-lista" id="conversas-chat-lista">
              ${conversaMensagens.length ? conversaMensagens.map(m=>`
                <div class="wa-msg wa-msg-${m.direction}">
                  ${renderConteudoMensagem(m)}
                  <span>${new Date(m.timestamp).toLocaleString('pt-BR')} ${m.direction==='out' ? statusMensagemIcone(m.status) : ''}</span>
                </div>
              `).join('') : '<p class="settings-page-note">Nenhuma mensagem ainda.</p>'}
            </div>
          `}
          <div class="wa-conversa-input-row">
            <input type="text" id="conversas-nova-msg" placeholder="Digite uma mensagem..." value="${esc(conversaTexto)}" />
            <button type="button" class="btn-primary" id="conversas-enviar-btn" ${conversaEnviando?'disabled':''}>Enviar</button>
          </div>
        `}
      </div>

      <div class="conversas-col-detalhes">
        ${!card ? `<div class="conversas-vazio">—</div>` : `
          <div class="settings-page-subtitle">Detalhes do cliente</div>
          <div class="field">
            <label>Nome</label>
            <input type="text" id="cv-det-nome" value="${esc(card.cliente)}" />
          </div>
          <div class="field">
            <label>Telefone</label>
            <input type="text" id="cv-det-telefone" value="${esc(card.telefone||'')}" />
          </div>
          <div class="field">
            <label>Valor</label>
            <div class="money-wrap">
              <span>R$</span>
              <input type="text" inputmode="numeric" id="cv-det-valor" value="${card.valor ? Number(card.valor).toLocaleString('pt-BR') : ''}" />
            </div>
          </div>
          <div class="field">
            <label>Qualificação</label>
            <select id="cv-det-temp">
              <option value="quente" ${card.temperatura==='quente'?'selected':''}>🔥 Quente</option>
              <option value="morno" ${card.temperatura==='morno'?'selected':''}>☀️ Morno</option>
              <option value="frio" ${card.temperatura==='frio'?'selected':''}>❄️ Frio</option>
            </select>
          </div>
          <button class="btn-outline" data-action="open-edit-card" data-card-id="${card.id}" style="width:100%; margin-top:4px;">Ver ficha completa</button>

          <div class="settings-sep-line"></div>
          <div class="settings-page-subtitle">Automações dessa etapa</div>
          ${automacoesRelevantes.length ? automacoesRelevantes.map(a=>`
            <div class="conversas-automacao-item">
              <span>${esc(a.nome)}</span>
              <div class="settings-btn-row">
                <button class="btn-outline" data-action="executar-automacao-manual" data-automacao-id="${a.id}" title="Executar agora nesse cliente">▶</button>
                <button class="icon-btn" data-action="editar-automacao-conversa" data-automacao-id="${a.id}" title="Editar">${ICON_EDIT}</button>
              </div>
            </div>
          `).join('') : `<p class="settings-page-note">Nenhuma automação configurada pra coluna atual desse cliente.</p>`}
          <button class="btn-outline" data-action="open-new-automacao-conversa" style="width:100%; margin-top:8px;">+ Nova automação</button>
        `}
      </div>
    </div>
    ${conversasOverlay ? `
      <div class="conversas-overlay-backdrop" data-action="fechar-overlay-conversas">
        <div class="conversas-overlay-painel" onclick="event.stopPropagation()">
          <button class="icon-btn conversas-overlay-fechar" data-action="fechar-overlay-conversas" title="Fechar">✕</button>
          ${conversasOverlay==='automacoes' ? renderAutomacoesPage() : ''}
          ${conversasOverlay==='disparos' ? renderDisparosPage() : ''}
          ${conversasOverlay==='agendamentos' ? renderAgendamentosPage() : ''}
        </div>
      </div>
    ` : ''}
  `;
}

/* ---------- página: Disparos ---------- */
function renderDisparosPage(){
  const filtrados = board.cards.filter(c=>{
    if(disparoFiltroColuna && c.columnId !== disparoFiltroColuna) return false;
    if(disparoFiltroTemp && c.temperatura !== disparoFiltroTemp) return false;
    return !!c.telefone;
  });
  return `
    <div class="page-head">
      <div>
        <h1>Disparos</h1>
        <p>Envie a mesma mensagem para vários leads de uma vez</p>
      </div>
    </div>
    ${!whatsappConnected ? `<div class="tasks-empty">Conecte o WhatsApp Business em Configurações → Integrações para usar os disparos.</div>` : `
      <div class="settings-page-section" style="margin-bottom:20px;">
        <h3>Filtrar leads</h3>
        <div class="field-row">
          <div class="field">
            <label>Coluna</label>
            <select id="disparo-coluna">
              <option value="">Todas</option>
              ${board.columns.map(c=>`<option value="${c.id}" ${disparoFiltroColuna===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Qualificação</label>
            <select id="disparo-temp">
              <option value="">Todas</option>
              <option value="quente" ${disparoFiltroTemp==='quente'?'selected':''}>Quente</option>
              <option value="morno" ${disparoFiltroTemp==='morno'?'selected':''}>Morno</option>
              <option value="frio" ${disparoFiltroTemp==='frio'?'selected':''}>Frio</option>
            </select>
          </div>
        </div>
        <p class="settings-page-note">${filtrados.length} lead(s) com telefone encontrados. Marque quem vai receber:</p>
        <div class="disparo-lista-leads">
          ${filtrados.length ? filtrados.map(c=>`
            <label class="disparo-lead-item">
              <input type="checkbox" class="disparo-lead-checkbox" data-card-id="${c.id}" ${disparoSelecionados.has(c.id)?'checked':''} />
              <span>${esc(c.cliente)} <span class="settings-page-note">${esc(c.telefone)}</span></span>
            </label>
          `).join('') : '<p class="dash-empty">Nenhum lead encontrado com esse filtro.</p>'}
        </div>
        <div class="settings-btn-row" style="margin-top:10px;">
          <button class="btn-outline" data-action="disparo-selecionar-todos">Selecionar todos</button>
          <button class="btn-outline" data-action="disparo-limpar-selecao">Limpar seleção</button>
        </div>
      </div>

      <div class="settings-page-section">
        <h3>Mensagem</h3>
        <label class="settings-toggle-row">
          <span>Usar modelo de mensagem (alcança leads frios)</span>
          <span class="switch ${disparoUsarTemplate?'on':''}" data-action="toggle-disparo-template">
            <span class="switch-knob"></span>
          </span>
        </label>
        ${disparoUsarTemplate ? `
          <div class="field-row">
            <div class="field">
              <label>Nome do modelo</label>
              <input type="text" id="disparo-template-nome" value="${esc(disparoTemplateNome)}" placeholder="ex: boas_vindas" />
            </div>
            <div class="field">
              <label>Idioma</label>
              <input type="text" id="disparo-template-idioma" value="${esc(disparoTemplateIdioma)}" placeholder="pt_BR" />
            </div>
          </div>
          <div class="field">
            <label>Variáveis do modelo (opcional, separadas por vírgula, na ordem certa)</label>
            <input type="text" id="disparo-template-variaveis" value="${esc(disparoTemplateVariaveis)}" placeholder="Ex: João, 15/08" />
          </div>
          <button class="btn-outline" data-action="carregar-templates">Carregar modelos aprovados</button>
          ${disparoTemplatesDisponiveis.length ? `<p class="settings-page-note">Modelos encontrados: ${disparoTemplatesDisponiveis.map(t=>esc(t.nome)).join(', ')}</p>` : ''}
        ` : `
          <div class="field">
            <textarea id="disparo-texto" rows="4" placeholder="Escreva a mensagem que será enviada...">${esc(disparoTexto)}</textarea>
          </div>
        `}
        <p class="settings-page-note">⚠️ Texto livre só chega pra quem te escreveu nas últimas 24h — regra da própria Meta. Modelo de mensagem funciona pra qualquer lead, inclusive frio, mas precisa estar aprovado no Meta Business Manager antes.</p>
        ${disparoResultado ? `<p class="settings-page-msg ${disparoResultado.falha ? 'erro' : 'ok'}">${disparoResultado.sucesso} enviada(s)${disparoResultado.falha ? `, ${disparoResultado.falha} falharam` : ''}.</p>` : ''}
        ${disparoResultado && disparoResultado.detalhesFalha && disparoResultado.detalhesFalha.length ? `
          <div class="settings-page-section" style="margin-top:0;">
            <div class="settings-page-subtitle">Detalhes das falhas</div>
            ${disparoResultado.detalhesFalha.map(d=>`<p class="settings-page-note">• ${esc(d.cliente||'')}: ${esc(d.erro||'')}</p>`).join('')}
          </div>
        ` : ''}
        <button class="btn-primary" data-action="enviar-disparo" ${disparoEnviando?'disabled':''}>${disparoEnviando ? 'Enviando…' : `Enviar para ${disparoSelecionados.size} lead(s)`}</button>
      </div>
    `}
  `;
}

/* ---------- página: Relatórios ---------- */
function cardsParaRelatorio(){
  if(!relatorioFunilId) return board.cards;
  const colunaIds = new Set(board.columns.filter(c=>c.funilId===relatorioFunilId).map(c=>c.id));
  return board.cards.filter(c=>colunaIds.has(c.columnId));
}
function renderRelatoriosPage(){
  const cardsRel = cardsParaRelatorio();
  const dados = relatoriosDadosMensais(12, cardsRel);
  const maxNovos = Math.max(1, ...dados.map(d=>d.novos));
  const maxGanhoValor = Math.max(1, ...dados.map(d=>d.ganhoValor));
  const totalGanho = cardsRel.reduce((s,c)=>{ const col=board.columns.find(k=>k.id===c.columnId); return col&&col.tipo==='ganho' ? s+(Number(c.valor)||0) : s; },0);
  const totalPerdido = cardsRel.reduce((s,c)=>{ const col=board.columns.find(k=>k.id===c.columnId); return col&&col.tipo==='perdido' ? s+(Number(c.valor)||0) : s; },0);
  const porTemp = ['quente','morno','frio'].map(t=>({ temp:t, count: cardsRel.filter(c=>c.temperatura===t).length }));

  return `
    <div class="page-head">
      <div>
        <h1>Relatórios</h1>
        <p>Visão consolidada dos últimos 12 meses</p>
      </div>
      <div class="page-head-actions">
        <select id="relatorio-funil-select" class="leads-filter">
          <option value="">Todos os funis</option>
          ${funis.map(f=>`<option value="${f.id}" ${relatorioFunilId===f.id?'selected':''}>${esc(f.nome)}</option>`).join('')}
        </select>
        <button class="btn-outline" data-action="exportar-csv">Exportar CSV</button>
        <button class="btn-outline" data-action="exportar-relatorio-pdf">Exportar PDF</button>
      </div>
    </div>

    <div class="metric-grid">
      <div class="metric-card"><div class="metric-card-top"><span>Total ganho</span></div><div class="metric-value">${fmtBRL(totalGanho)}</div></div>
      <div class="metric-card"><div class="metric-card-top"><span>Total perdido</span></div><div class="metric-value">${fmtBRL(totalPerdido)}</div></div>
      <div class="metric-card"><div class="metric-card-top"><span>Total de leads</span></div><div class="metric-value">${cardsRel.length}</div></div>
    </div>

    <div class="dash-panel">
      <div class="dash-panel-title">Valor ganho por mês (histórico)</div>
      <div class="stage-list">
        ${dados.map(d=>`
          <div class="stage-row">
            <div class="stage-row-top"><span>${monthLabel(d.key)}</span><span>${fmtBRL(d.ganhoValor)} ${d.ganhoQtd?`· ${d.ganhoQtd} venda${d.ganhoQtd===1?'':'s'}`:''}</span></div>
            <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${d.ganhoValor/maxGanhoValor*100}%"></div></div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="dash-panel">
      <div class="dash-panel-title">Novos leads por mês</div>
      <div class="stage-list">
        ${dados.map(d=>`
          <div class="stage-row">
            <div class="stage-row-top"><span>${monthLabel(d.key)}</span><span>${d.novos}</span></div>
            <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${d.novos/maxNovos*100}%"></div></div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="dash-panel">
      <div class="dash-panel-title">Leads por qualificação</div>
      <div class="stage-list">
        ${porTemp.map(t=>`
          <div class="stage-row">
            <div class="stage-row-top"><span>${TEMPS[t.temp].label}</span><span>${t.count}</span></div>
            <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${cardsRel.length ? (t.count/cardsRel.length*100) : 0}%"></div></div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/* ---------- tela compartilhada: criar/entrar numa equipe ---------- */
function renderEquipeSetup(tituloPagina, subtitulo){
  return `
    <div class="page-head">
      <div>
        <h1>${tituloPagina}</h1>
        <p>${subtitulo}</p>
      </div>
    </div>
    <div class="settings-page-grid">
      <div class="settings-page-section">
        <h3>Criar uma equipe</h3>
        <p class="settings-page-note">Você vira supervisor(a) automaticamente e ganha um código pra convidar outras pessoas. O funil de cada um continua separado — só o chat e a supervisão são compartilhados.</p>
        <div class="field">
          <input type="text" id="equipe-nome-novo" placeholder="Nome da equipe" value="${esc(equipeNomeNovo)}" />
        </div>
        <button class="btn-primary" data-action="criar-equipe">Criar equipe</button>
      </div>
      <div class="settings-page-section">
        <h3>Entrar numa equipe existente</h3>
        <p class="settings-page-note">Peça o código de convite pra quem já criou a equipe.</p>
        <div class="field">
          <input type="text" id="equipe-codigo-entrar" placeholder="Código de convite" value="${esc(equipeCodigoEntrar)}" />
        </div>
        <button class="btn-outline" data-action="entrar-equipe">Entrar</button>
      </div>
    </div>
    ${equipeMsg ? `<p class="settings-page-msg ${equipeMsg.tipo}" style="margin-top:14px;">${esc(equipeMsg.texto)}</p>` : ''}
  `;
}

/* ---------- página: Chat Interno ---------- */
function renderMensagensEInput(mensagens, carregado, inputId, enviarAction, valorInput, enviando, vazioTexto){
  return `
    ${!carregado ? `<p class="settings-page-note">Carregando conversa…</p>` : `
      <div class="chat-interno-mensagens" id="${inputId}-mensagens">
        ${mensagens.length ? mensagens.map(m=>`
          <div class="wa-msg ${m.remetenteId===(currentUser&&currentUser.id)?'wa-msg-out':'wa-msg-in'}">
            <p><b>${m.remetenteId===(currentUser&&currentUser.id)?'Você':esc(m.remetenteNome)}:</b> ${esc(m.texto)}</p>
            <span>${formatDateHora(m.timestamp)}</span>
          </div>
        `).join('') : `<p class="settings-page-note">${vazioTexto}</p>`}
      </div>
      <div class="wa-conversa-input-row">
        <input type="text" id="${inputId}" placeholder="Escreva uma mensagem..." value="${esc(valorInput)}" />
        <button class="btn-primary" data-action="${enviarAction}" ${enviando?'disabled':''}>Enviar</button>
      </div>
    `}
  `;
}
function renderChatInternoConteudo(){
  const conversandoComOutro = !!dmDestinatarioId;
  const outro = conversandoComOutro ? equipe.membros.find(m=>m.id===dmDestinatarioId) : null;
  return `
    <div class="chat-interno-wrap">
      <div class="chat-interno-membros">
        <div class="settings-page-subtitle">Conversas</div>
        <button class="chat-membro-item chat-membro-btn ${!conversandoComOutro?'chat-membro-ativo':''}" data-action="fechar-conversa-individual">💬 Chat da equipe</button>
        ${equipe.membros.filter(m=>!m.souEu).map(m=>`
          <button class="chat-membro-item chat-membro-btn ${dmDestinatarioId===m.id?'chat-membro-ativo':''}" data-action="abrir-conversa-individual" data-user-id="${m.id}">${esc(m.nome||m.email)}${m.papel==='supervisor'?' ⭐':''}</button>
        `).join('')}
        ${equipe.membros.filter(m=>m.souEu).map(m=>`<div class="chat-membro-item chat-membro-eu">${esc(m.nome||m.email)} (você)</div>`).join('')}
      </div>
      <div class="chat-interno-main">
        <div class="settings-page-subtitle">${conversandoComOutro ? `Conversa com ${esc(outro ? (outro.nome||outro.email) : '')}` : 'Chat da equipe'}</div>
        ${conversandoComOutro
          ? renderMensagensEInput(dmMensagens, dmLoaded, 'chat-individual-input', 'enviar-chat-individual', dmTexto, dmEnviando, 'Nenhuma mensagem ainda.')
          : renderMensagensEInput(chatMensagens, chatLoaded, 'chat-interno-input', 'enviar-chat-interno', chatTexto, chatEnviando, 'Nenhuma mensagem ainda. Diga oi pra equipe!')
        }
      </div>
    </div>
  `;
}
function renderEquipePage(){
  if(!equipeLoaded){
    return `<div class="page-head"><div><h1>Equipe</h1><p>Carregando…</p></div></div>`;
  }
  if(!equipe){
    return renderEquipeSetup('Equipe', 'Você ainda não faz parte de uma equipe');
  }
  const abas = [['chat','Chat']];
  if(equipe.souSupervisor) abas.push(['supervisao','Gestão']);
  if(equipe.souSupervisorDeDados) abas.push(['monitoramento','Monitoramento']);
  return `
    <div class="page-head">
      <div>
        <h1>Equipe</h1>
        <p>${esc(equipe.nome)} · ${equipe.membros.length} membro${equipe.membros.length===1?'':'s'}</p>
      </div>
    </div>
    ${abas.length > 1 ? `
      <div class="funil-tabs" style="margin-bottom:20px;">
        ${abas.map(([key,label])=>`<button class="tab-btn ${equipeSubTab===key?'active':''}" data-action="set-equipe-subtab" data-subtab="${key}">${label}</button>`).join('')}
      </div>
    ` : ''}
    ${equipeSubTab==='chat' ? renderChatInternoConteudo() : ''}
    ${equipeSubTab==='supervisao' && equipe.souSupervisor ? renderSupervisaoConteudo() : ''}
    ${equipeSubTab==='monitoramento' && equipe.souSupervisorDeDados ? renderMonitoramentoConteudo() : ''}
  `;
}

/* ---------- página: Supervisão ---------- */
// Supervisor sempre primeiro, os demais em ordem alfabética por nome
function membrosOrdenados(membros){
  return [...membros].sort((a,b)=>{
    if(a.papel==='supervisor' && b.papel!=='supervisor') return -1;
    if(b.papel==='supervisor' && a.papel!=='supervisor') return 1;
    return (a.nome||'').localeCompare(b.nome||'', 'pt-BR');
  });
}
// Ranking de vendas: supervisor(es) destacado(s) à parte, fora da disputa por valor
// (o papel dele é apoiar a equipe, não vender — não é justo rankeá-lo pelo mesmo critério).
// Os demais membros continuam ordenados por valor ganho entre si.
function renderRankingSupervisao(membros){
  const supervisores = membros.filter(m=>m.papel==='supervisor');
  const resto = membros.filter(m=>m.papel!=='supervisor').sort((a,b)=>b.ganhoValor-a.ganhoValor);
  const maxGanho = Math.max(1, ...membros.map(x=>x.ganhoValor));
  let html = '';
  if(supervisores.length){
    html += supervisores.map(m=>`
      <div class="ranking-supervisor-card">
        <div class="stage-row-top"><span>⭐ ${esc(m.nome)} <span class="settings-page-note">— Gestor, fora do ranking de vendas</span></span><span>${fmtBRL(m.ganhoValor)}</span></div>
        <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${(m.ganhoValor/maxGanho*100)}%"></div></div>
      </div>
    `).join('');
  }
  if(resto.length){
    html += `
      <div class="stage-list" style="margin-top:${supervisores.length?'14px':'0'};">
        ${resto.map((m,idx)=>`
          <div class="stage-row">
            <div class="stage-row-top">
              <span>${idx+1}º — ${esc(m.nome)}</span>
              <span style="display:flex; align-items:center; gap:10px;">
                ${fmtBRL(m.ganhoValor)}
                <button type="button" class="btn-outline" style="padding:4px 10px; font-size:11px;" data-action="ver-dashboard-membro" data-user-id="${m.userId}" data-nome="${esc(m.nome)}">Ver Dashboard</button>
              </span>
            </div>
            <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${(m.ganhoValor/maxGanho*100)}%"></div></div>
          </div>
        `).join('')}
      </div>
    `;
  }
  return html || '<p class="dash-empty">Nenhum membro ainda.</p>';
}
function renderSupervisaoConteudo(){
  return `
    <div class="settings-page-section" style="margin-bottom:20px;">
      <h3>Convidar pessoas</h3>
      <p class="settings-page-note">Compartilhe esse código — quem entrar com ele vira membro da equipe, mantendo o funil próprio dele:</p>
      <div class="settings-page-row"><span>Código de convite</span><span style="font-family:'IBM Plex Mono',monospace; font-weight:700; letter-spacing:.05em;">${esc(equipe.codigoConvite||'')}</span></div>
      <button class="btn-outline" data-action="regenerar-codigo-equipe">Gerar novo código</button>
    </div>

    <div class="settings-page-section" style="margin-bottom:20px;">
      <h3>Membros</h3>
      <div class="disparo-lista-leads" style="max-height:none;">
        ${membrosOrdenados(equipe.membros).map(m=>`
          <div class="disparo-lead-item ${m.papel==='supervisor'?'membro-supervisor-destaque':''}" style="cursor:default; flex-direction:column; align-items:stretch; gap:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span>${esc(m.nome||m.email)} — ${m.papel==='supervisor'?'⭐ Gestor':'Membro'}${m.supervisorDeDados?' · 🛠 Supervisor de dados':''}${m.souEu?' (você)':''}</span>
              ${!m.souEu ? `
                <div class="settings-btn-row">
                  <button class="btn-outline" data-action="alterar-papel-membro" data-user-id="${m.id}" data-papel="${m.papel==='supervisor'?'membro':'supervisor'}">${m.papel==='supervisor'?'Rebaixar':'Promover'}</button>
                  <button class="btn-outline" data-action="toggle-supervisor-dados" data-user-id="${m.id}" data-ativo="${m.supervisorDeDados?'0':'1'}">${m.supervisorDeDados?'Remover supervisor de dados':'Tornar supervisor de dados'}</button>
                  <button class="btn-outline" data-action="remover-membro" data-user-id="${m.id}">Remover</button>
                </div>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>
      <button class="btn-outline" data-action="sair-equipe" style="margin-top:10px;">Sair da equipe</button>
    </div>

    <div class="settings-page-section" style="margin-bottom:20px;">
      <h3>Ranking de desempenho (por valor ganho)</h3>
      ${!supervisaoLoaded ? `<p class="settings-page-note">Carregando…</p>` : (supervisaoMembros.length ? renderRankingSupervisao(supervisaoMembros) : `<p class="dash-empty">Nenhum membro ainda.</p>`)}
    </div>

    <div class="settings-page-section">
      <h3>Desempenho por membro</h3>
      ${!supervisaoLoaded ? `<p class="settings-page-note">Carregando…</p>` : `
        <div class="leads-table-wrap" style="border:none;">
          <table class="leads-table">
            <thead><tr><th>Nome</th><th>Leads</th><th>Em negociação</th><th>Ganho</th><th>Perdido</th></tr></thead>
            <tbody>
              ${membrosOrdenados(supervisaoMembros).map(m=>`
                <tr class="${m.papel==='supervisor'?'membro-supervisor-destaque':''}">
                  <td>${esc(m.nome)} ${m.papel==='supervisor'?'⭐':''}</td>
                  <td>${m.totalLeads}</td>
                  <td>${fmtBRL(m.abertoValor)}</td>
                  <td>${fmtBRL(m.ganhoValor)}</td>
                  <td>${fmtBRL(m.perdidoValor)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}
function renderMonitoramentoConteudo(){
  return `
    <div class="settings-page-section">
      <h3>Monitoramento de erros do sistema</h3>
      <p class="settings-page-note">Erros técnicos registrados automaticamente nos últimos 30 dias — útil pra perceber se algo quebrou sem precisar esperar alguém reclamar.</p>
      <div class="settings-btn-row" style="margin-bottom:14px;">
        <button class="btn-outline" data-action="atualizar-monitoramento">Atualizar</button>
        <button class="delete-link" data-action="limpar-monitoramento">🗑 Limpar log</button>
      </div>
      ${!monitoramentoLoaded ? `<p class="settings-page-note">Carregando…</p>` : (monitoramentoErros.length ? `
        <div class="historico-lista">
          ${monitoramentoErros.map(e=>`
            <div class="historico-item" style="align-items:flex-start; flex-direction:column; gap:4px;">
              <div style="display:flex; justify-content:space-between; width:100%;">
                <span class="badge" style="background:${e.tipo==='rota'?'var(--badge-neutral-bg)':'var(--danger-soft)'};color:${e.tipo==='rota'?'var(--ink-soft)':'var(--danger)'};">${e.tipo==='excecao_nao_tratada'?'Exceção crítica':e.tipo==='promise_rejeitada'?'Promise sem tratamento':'Erro de rota'}</span>
                <span class="historico-item-data">${formatDateHora(e.createdAt)}</span>
              </div>
              <span class="historico-item-texto">${esc(e.mensagem)}</span>
            </div>
          `).join('')}
        </div>
      ` : `<p class="dash-empty">Nenhum erro registrado — tudo tranquilo por aqui.</p>`)}
    </div>
  `;
}

/* ---------- página: Automações ---------- */
function renderAutomacoesPage(){
  if(!automacoesLoaded){
    return `<div class="page-head"><div><h1>Automações</h1><p>Carregando…</p></div></div>`;
  }
  return `
    <div class="page-head">
      <div>
        <h1>Automações</h1>
        <p>Ações automáticas quando um cliente entra numa coluna</p>
      </div>
      <button class="btn-primary" data-action="open-new-automacao">+ Nova automação</button>
    </div>
    ${automacoes.length ? `
      <div class="automacoes-list">
        ${automacoes.map(a=>{
          const coluna = board.columns.find(c=>c.id===a.colunaGatilhoId);
          const gatilhoTexto = a.gatilhoTipo === 'tempo_parado'
            ? `fica <b>${(a.acaoParams&&a.acaoParams.diasParado)||5}+ dias parado</b> em`
            : `entra em`;
          const acaoTexto = a.acaoTipo === 'criar_tarefa'
            ? `cria a tarefa "${esc((a.acaoParams&&a.acaoParams.titulo)||'Follow-up automático')}"`
            : `move pra "${esc((board.columns.find(c=>c.id===(a.acaoParams&&a.acaoParams.colunaDestinoId))||{}).nome || '—')}"`;
          return `
            <div class="automacao-card ${a.ativa?'':'automacao-inativa'}">
              <div class="contrato-card-head">
                <div>
                  <h3 class="contrato-card-title">${esc(a.nome)}</h3>
                  <p class="contrato-card-note">Quando o cliente ${gatilhoTexto} <b>${esc(coluna?coluna.nome:'coluna removida')}</b> → ${acaoTexto}</p>
                </div>
                <div class="contrato-card-actions">
                  <span class="switch ${a.ativa?'on':''}" data-action="toggle-automacao" data-automacao-id="${a.id}" title="${a.ativa?'Ativa':'Inativa'}"><span class="switch-knob"></span></span>
                  <button class="icon-btn" data-action="open-edit-automacao" data-automacao-id="${a.id}" title="Editar">${ICON_EDIT}</button>
                  <button class="icon-btn" data-action="delete-automacao" data-automacao-id="${a.id}" title="Excluir">${ICON_TRASH}</button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    ` : `<div class="tasks-empty">Nenhuma automação criada ainda.</div>`}
  `;
}

/* ---------- página: Fluxos ---------- */
function renderFluxosPage(){
  if(!fluxosLoaded){
    return `<div class="page-head"><div><h1>Fluxos</h1><p>Carregando…</p></div></div>`;
  }
  return `
    <div class="page-head">
      <div>
        <h1>Fluxos</h1>
        <p>Sequências de etapas ao longo do tempo, a partir de quando o cliente entra numa coluna</p>
      </div>
      <button class="btn-primary" data-action="open-new-fluxo">+ Novo fluxo</button>
    </div>
    ${fluxos.length ? `
      <div class="automacoes-list">
        ${fluxos.map(f=>{
          const coluna = board.columns.find(c=>c.id===f.colunaGatilhoId);
          const temMensagem = (f.etapas||[]).some(e=>e.tipo==='mensagem');
          return `
            <div class="automacao-card ${f.ativo?'':'automacao-inativa'}">
              <div class="contrato-card-head">
                <div>
                  <h3 class="contrato-card-title">${esc(f.nome)}</h3>
                  <p class="contrato-card-note">
                    Começa quando entra em <b>${esc(coluna?coluna.nome:'coluna removida')}</b> ·
                    ${(f.etapas||[]).length} etapa${(f.etapas||[]).length===1?'':'s'} ·
                    ${f.emAndamento||0} cliente${(f.emAndamento||0)===1?'':'s'} em andamento
                    ${temMensagem ? ' · <span style="color:var(--danger)">envia WhatsApp</span>' : ''}
                  </p>
                </div>
                <div class="contrato-card-actions">
                  <span class="switch ${f.ativo?'on':''}" data-action="toggle-fluxo" data-fluxo-id="${f.id}" title="${f.ativo?'Ativo':'Inativo'}"><span class="switch-knob"></span></span>
                  <button class="icon-btn" data-action="open-edit-fluxo" data-fluxo-id="${f.id}" title="Editar">${ICON_EDIT}</button>
                  <button class="icon-btn" data-action="delete-fluxo" data-fluxo-id="${f.id}" title="Excluir">${ICON_TRASH}</button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    ` : `<div class="tasks-empty">Nenhum fluxo criado ainda.</div>`}
  `;
}

/* ---------- página: Agendamentos ---------- */
function renderAgendamentosPage(){
  if(!agendamentosLoaded){
    return `<div class="page-head"><div><h1>Agendar Mensagem</h1><p>Carregando…</p></div></div>`;
  }
  return `
    <div class="page-head">
      <div>
        <h1>Agendar Mensagem</h1>
        <p>Tudo que está programado pra enviar, o que já saiu, e o que foi cancelado ou falhou</p>
      </div>
      <button class="btn-primary" data-action="open-new-agendamento">+ Nova mensagem</button>
    </div>
    <div class="metric-grid">
      <div class="metric-card"><div class="metric-card-top"><span>A enviar</span></div><div class="metric-value">${agendamentosContagem.pendente||0}</div></div>
      <div class="metric-card"><div class="metric-card-top"><span>Enviadas</span></div><div class="metric-value">${agendamentosContagem.enviada||0}</div></div>
      <div class="metric-card"><div class="metric-card-top"><span>Canceladas</span></div><div class="metric-value">${agendamentosContagem.cancelada||0}</div></div>
      <div class="metric-card"><div class="metric-card-top"><span>Falhas</span></div><div class="metric-value">${agendamentosContagem.falhou||0}</div></div>
    </div>
    ${agendamentos.length ? `
      <div class="leads-table-wrap">
        <table class="leads-table">
          <thead><tr><th>Cliente</th><th>Mensagem</th><th>Data/hora</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            ${agendamentos.map(a=>`
              <tr>
                <td>${esc(a.clienteNome)}</td>
                <td>${esc((a.texto||'').slice(0,60))}${(a.texto||'').length>60?'…':''}</td>
                <td>${formatDateHora(a.agendadoPara)}</td>
                <td>${agendamentoStatusLabel(a.status)}${a.status==='falhou' && a.erro ? ` <span class="settings-page-note">(${esc(a.erro)})</span>` : ''}</td>
                <td>
                  ${a.status==='pendente' ? `<button class="icon-btn" data-action="cancelar-agendamento" data-agendamento-id="${a.id}" title="Cancelar">✕</button>` : ''}
                  <button class="icon-btn" data-action="excluir-agendamento" data-agendamento-id="${a.id}" title="Excluir permanentemente">${ICON_TRASH}</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : `<div class="tasks-empty">Nenhuma mensagem agendada ainda.</div>`}
  `;
}

/* ---------- página: Importar/Exportar ---------- */
function renderImportExportPage(){
  return `
    <div class="page-head">
      <div>
        <h1>Importar/Exportar</h1>
        <p>Importe uma planilha (.csv ou .xlsx) — os dados viram "possíveis leads" até você completar e confirmar cada um.</p>
      </div>
    </div>

    <div class="settings-page-section">
      <h3>1. Importar planilha</h3>
      <input type="file" id="planilha-input" accept=".csv,.xlsx,.xls" />
      ${importPlanilhaColunas.length ? `
        <p class="settings-page-note" style="margin-top:10px;">${importPlanilhaLinhas.length} linha(s) encontrada(s) em "${esc(importPlanilhaNomeArquivo)}". Escolha qual coluna da planilha é qual campo:</p>
        <div class="field-row">
          <div class="field">
            <label>Coluna do nome</label>
            <select id="map-nome">
              <option value="">(nenhuma)</option>
              ${importPlanilhaColunas.map(c=>`<option value="${esc(c)}" ${importMapNome===c?'selected':''}>${esc(c)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Coluna do telefone</label>
            <select id="map-telefone">
              <option value="">(nenhuma)</option>
              ${importPlanilhaColunas.map(c=>`<option value="${esc(c)}" ${importMapTelefone===c?'selected':''}>${esc(c)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Coluna do serviço desejado</label>
            <select id="map-servico">
              <option value="">(nenhuma)</option>
              ${importPlanilhaColunas.map(c=>`<option value="${esc(c)}" ${importMapServico===c?'selected':''}>${esc(c)}</option>`).join('')}
            </select>
          </div>
        </div>
        ${importPlanilhaMsg ? `<p class="settings-page-msg ${importPlanilhaMsg.tipo}">${esc(importPlanilhaMsg.texto)}</p>` : ''}
        <button class="btn-primary" id="confirmar-import-planilha" ${importandoPlanilha?'disabled':''}>${importandoPlanilha?'Importando…':'Importar planilha'}</button>
      ` : (importPlanilhaMsg ? `<p class="settings-page-msg ${importPlanilhaMsg.tipo}">${esc(importPlanilhaMsg.texto)}</p>` : '')}
    </div>

    <div class="settings-page-section">
      <h3>2. Possíveis leads (${possiveisLeads.length})</h3>
      <p class="settings-page-note">Complete as informações de cada um pra adicioná-lo de vez aos Leads.</p>
      ${!possiveisLeadsCarregados ? `<p class="settings-page-note">Carregando…</p>` : (possiveisLeads.length ? `
        <div class="leads-table-wrap">
          <table class="leads-table">
            <thead><tr><th>Nome</th><th>Telefone</th><th>Serviço desejado</th><th>Ações</th></tr></thead>
            <tbody>
              ${possiveisLeads.map(l=>`
                <tr>
                  <td>${esc(l.nome)||'—'}</td>
                  <td>${esc(l.telefone)||'—'}</td>
                  <td>${esc(l.tipoServico)||'—'}</td>
                  <td>
                    <button class="btn-outline" data-action="completar-possivel-lead" data-lead-id="${l.id}">Completar</button>
                    <button class="icon-btn" data-action="descartar-possivel-lead" data-lead-id="${l.id}" title="Descartar">${ICON_TRASH}</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `<div class="tasks-empty">Nenhum possível lead pendente.</div>`)}
    </div>

    <div class="settings-page-section">
      <h3>3. Exportar</h3>
      <p class="settings-page-note">Baixa todos os clientes já confirmados (que estão na aba Leads) em CSV.</p>
      <button class="btn-outline" data-action="exportar-leads">Exportar Leads (CSV)</button>
    </div>
  `;
}

/* ---------- página: Suporte ---------- */
function renderSuportePage(){
  return `
    <div class="page-head">
      <div>
        <h1>Suporte</h1>
        <p>Dúvidas e contato</p>
      </div>
    </div>
    <div class="settings-page-grid">
      <div class="settings-page-section">
        <h3>Perguntas frequentes</h3>
        <p class="settings-page-note"><b>Como conecto o WhatsApp Business?</b><br/>Configurações → Integrações → WhatsApp Business API, seguindo o passo a passo do README do projeto.</p>
        <p class="settings-page-note"><b>Por que uma mensagem de Disparo não chegou?</b><br/>A API do WhatsApp só permite texto livre pra quem te escreveu nas últimas 24h.</p>
        <p class="settings-page-note"><b>Como mudo a cor do painel?</b><br/>Configurações → Aparência.</p>
        <p class="settings-page-note"><b>Como conecto a Google Agenda?</b><br/>Configurações → Integrações → Google Agenda.</p>
      </div>
      <div class="settings-page-section">
        <h3>Contato</h3>
        <p class="settings-page-note">Encontrou um problema ou tem uma sugestão pro painel? Fale com quem administra esse CRM.</p>
        <a class="btn-primary" href="mailto:?subject=Painel%20CRM%20-%20Suporte" style="display:inline-block; text-decoration:none; text-align:center;">Enviar e-mail</a>
      </div>
    </div>
  `;
}

/* ---------- modal do contrato de comissão ---------- */
function openNewContrato(){
  contratoModalForm = { __isNew:true, id:null, desc:'', scope:'Pessoal', creditoValor:0, tipoCarta:'imovel', date: comissoesMonth + '-01' };
  renderContratoModal();
}
function openEditContrato(id){
  const c = contratos.find(x=>x.id===id);
  if(!c) return;
  contratoModalForm = { __isNew:false, id:c.id, desc:c.desc, scope:c.scope, creditoValor:c.creditoValor, tipoCarta:c.tipoCarta||'imovel', date:c.date };
  renderContratoModal();
}
function closeContratoModal(){ contratoModalForm = null; document.getElementById('modal-root').innerHTML=''; }

// Genérico pra N blocos — funciona pra qualquer regra, inclusive as que o usuário criar
// na engrenagem (2 blocos, 1 bloco, 5 blocos, o que for).
function previewComissaoHtml(prev){
  const linhas = prev.blocos.map(b=>
    b.parcelas === 1
      ? `🔹 Parcela única: <b>${fmtBRL(b.value)}</b>`
      : `🔹 ${b.parcelas} parcelas: <b>${fmtBRL(b.value)}</b> cada`
  ).join('<br/>');
  return `
    ${linhas}<br/>
    Total: ${prev.parcelas}x parcela${prev.parcelas===1?'':'s'} · Total líquido da comissão: <b>${fmtBRL(prev.total)}</b>
  `;
}
function renderContratoModal(){
  const root = document.getElementById('modal-root');
  if(!contratoModalForm){ root.innerHTML=''; return; }
  const f = contratoModalForm;
  const preview = calcComissaoPreviewPorTipo(f.creditoValor, f.tipoCarta);

  root.innerHTML = `
    <div class="overlay" id="contrato-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>${f.__isNew ? 'Novo contrato de comissão' : 'Editar contrato'}</h3>
          <button id="contrato-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Cliente / contrato</label>
            <input type="text" id="c-desc" value="${esc(f.desc)}" placeholder="Ex: Consórcio — Contrato Imóvel 118" />
          </div>
          <div class="field">
            <label>Escopo</label>
            <div class="scope-toggle" id="c-scope-toggle">
              <div class="scope-btn ${f.scope==='Pessoal'?'active':''}" data-scope="Pessoal">Pessoal</div>
              <div class="scope-btn ${f.scope==='Empresa'?'active':''}" data-scope="Empresa">Empresa</div>
            </div>
          </div>
          <div class="field">
            <label>Tipo de carta de crédito</label>
            <select id="c-tipo-carta">
              ${renderOpcoesTipoCarta(f.tipoCarta)}
            </select>
          </div>
          <div class="field">
            <label>Valor da carta de crédito vendida</label>
            <div class="money-wrap">
              <span>R$</span>
              <input type="text" inputmode="numeric" id="c-credito" value="${f.creditoValor ? Number(f.creditoValor).toLocaleString('pt-BR') : ''}" placeholder="0" />
            </div>
          </div>
          <div class="field">
            <label>Mês da 1ª parcela</label>
            <input type="month" id="c-mes" value="${(f.date||'').slice(0,7)}" />
            <p class="settings-page-note" id="c-mes-nota">${textoNotaMesContrato(f.tipoCarta)}</p>
          </div>
          <div class="calc-preview" id="c-preview">
            ${previewComissaoHtml(preview)}
          </div>
          <p class="calc-preview-note">O valor de cada parcela é calculado automaticamente a partir da carta de crédito, já líquido.</p>
        </div>
        <div class="modal-foot">
          ${!f.__isNew ? `<button class="delete-link" id="c-delete">🗑 Excluir</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            <button class="btn-outline" id="c-cancel">Cancelar</button>
            <button class="btn-save" id="c-save">${f.__isNew ? 'Criar contrato' : 'Salvar alterações'}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('contrato-modal-close').addEventListener('click', closeContratoModal);
  document.getElementById('c-cancel').addEventListener('click', closeContratoModal);
  document.getElementById('contrato-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='contrato-modal-overlay') closeContratoModal(); });

  document.getElementById('c-desc').addEventListener('input', (e)=> contratoModalForm.desc = e.target.value);
  document.getElementById('c-mes').addEventListener('change', (e)=> contratoModalForm.date = e.target.value + '-01');

  document.querySelectorAll('#c-scope-toggle .scope-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      contratoModalForm.scope = btn.dataset.scope;
      document.querySelectorAll('#c-scope-toggle .scope-btn').forEach(b=>{
        b.classList.toggle('active', b.dataset.scope===contratoModalForm.scope);
      });
    });
  });

  document.getElementById('c-tipo-carta').addEventListener('change', (e)=>{
    contratoModalForm.tipoCarta = e.target.value;
    const prev = calcComissaoPreviewPorTipo(contratoModalForm.creditoValor, contratoModalForm.tipoCarta);
    const previewEl = document.getElementById('c-preview');
    if(previewEl) previewEl.innerHTML = previewComissaoHtml(prev);
    const notaMes = document.getElementById('c-mes-nota');
    if(notaMes) notaMes.textContent = textoNotaMesContrato(contratoModalForm.tipoCarta);
  });

  const creditoInput = document.getElementById('c-credito');
  creditoInput.addEventListener('input', (e)=>{
    const { numero, texto } = maskInteiro(e.target.value);
    contratoModalForm.creditoValor = numero;
    e.target.value = texto;
    const prev = calcComissaoPreviewPorTipo(numero, contratoModalForm.tipoCarta);
    const previewEl = document.getElementById('c-preview');
    if(previewEl) previewEl.innerHTML = previewComissaoHtml(prev);
  });

  document.getElementById('c-save').addEventListener('click', saveContratoFromModal);
  if(!f.__isNew){
    document.getElementById('c-delete').addEventListener('click', ()=>{
      showConfirm({
        message: 'Excluir este contrato de comissão? Essa ação não pode ser desfeita.',
        onConfirm: ()=>{ deleteContratoById(f.id); closeContratoModal(); closeConfirm(); },
      });
    });
  }
}

/* ---------- modal: Regras de Comissão (engrenagem em Comissões) ----------
   Duas telas dentro do mesmo modal: lista (todas as regras do usuário) e editor
   (uma regra por vez — nome, mês independente e os blocos de parcelas, como uma
   planilha: cada linha é "N parcelas de X% da carta"). */
function openRegrasComissaoModal(){
  regrasModalAberto = true;
  regraEditForm = null;
  renderRegrasModal();
  if(!regrasComissaoLoaded) loadRegrasComissao();
}
function closeRegrasComissaoModal(){
  regrasModalAberto = false;
  regraEditForm = null;
  document.getElementById('modal-root').innerHTML = '';
  renderApp(); // a lista de contratos usa as regras pra mostrar nome/blocos — garante que reflita qualquer alteração
}
function abrirNovaRegra(){
  regraEditForm = { __isNew:true, id:null, nome:'', mesIndependente:false, blocos:[{ parcelas:1, percentual:0 }] };
  renderRegrasModal();
}
function abrirEditarRegra(id){
  const r = regrasComissao.find(x=>x.id===id);
  if(!r) return;
  regraEditForm = {
    __isNew:false, id:r.id, nome:r.nome, mesIndependente:!!r.mesIndependente,
    // o back-end guarda percentual como fração (0.016); no formulário mostramos "humano" (1.6)
    blocos: (r.blocos||[]).map(b=>({ parcelas:b.parcelas, percentual: Math.round(b.percentual*100*1000000)/1000000 })),
  };
  renderRegrasModal();
}
function renderRegraLinhaBloco(b, idx, podeRemover){
  return `
    <div class="regra-bloco-row">
      <div class="field">
        <label>Parcelas</label>
        <input type="number" min="1" step="1" class="regra-bloco-parcelas" data-idx="${idx}" value="${b.parcelas}" />
      </div>
      <div class="field">
        <label>% da carta (por parcela)</label>
        <input type="number" min="0" step="any" class="regra-bloco-percentual" data-idx="${idx}" value="${b.percentual}" />
      </div>
      <button type="button" class="icon-btn" data-action="remover-bloco-regra" data-idx="${idx}" title="Remover linha" ${podeRemover?'':'disabled'}>${ICON_TRASH}</button>
    </div>
  `;
}
function htmlPreviewRegraEditor(f){
  const REF = 100000; // carta de referência só pra simular — o valor real usa a carta de cada contrato
  const blocos = f.blocos.map(b=>({
    parcelas: Math.max(1, parseInt(b.parcelas,10)||1),
    value: Math.round(REF * ((parseFloat(b.percentual)||0)/100) * 100) / 100,
  }));
  const total = Math.round(blocos.reduce((s,b)=>s+b.value*b.parcelas,0)*100)/100;
  const totalParcelas = blocos.reduce((s,b)=>s+b.parcelas,0);
  const linhas = blocos.map(b=> b.parcelas===1
    ? `🔹 Parcela única: <b>${fmtBRL(b.value)}</b>`
    : `🔹 ${b.parcelas} parcelas: <b>${fmtBRL(b.value)}</b> cada`
  ).join('<br/>');
  return `${linhas}<br/>Total: ${totalParcelas}x parcela${totalParcelas===1?'':'s'} · Total líquido: <b>${fmtBRL(total)}</b>`;
}
function atualizarPreviewRegraEditor(){
  const el = document.getElementById('re-preview');
  if(el && regraEditForm) el.innerHTML = htmlPreviewRegraEditor(regraEditForm);
}
function htmlRegrasLista(){
  return `
    <div class="overlay" id="regras-modal-overlay">
      <div class="modal modal-lg">
        <div class="modal-head">
          <h3>Regras de comissão</h3>
          <button id="regras-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <p class="settings-page-note">Cada regra define como uma comissão é calculada, em blocos de parcelas — como uma planilha. Crie, renomeie, edite ou exclua regras à vontade: comissões já lançadas guardam o cálculo da época e não mudam retroativamente.</p>
          ${!regrasComissaoLoaded ? `<div class="tasks-empty">Carregando…</div>` : (regrasComissao.length ? `
            <div class="regras-lista">
              ${regrasComissao.map(r=>`
                <div class="regra-row">
                  <div class="regra-row-info">
                    <div class="regra-row-nome">${esc(r.nome)} ${r.mesIndependente?'<span class="badge badge-neutral" title="O mês da comissão pode ser editado sem alterar o mês do lead">Mês independente</span>':''}</div>
                    <div class="regra-row-blocos">${(r.blocos||[]).map(b=>`${b.parcelas}x ${(b.percentual*100).toLocaleString('pt-BR',{maximumFractionDigits:6})}%`).join(' · ')}</div>
                  </div>
                  <div class="regra-row-actions">
                    <button class="icon-btn" data-action="editar-regra" data-regra-id="${r.id}" title="Editar">${ICON_EDIT}</button>
                    <button class="icon-btn" data-action="excluir-regra" data-regra-id="${r.id}" title="Excluir">${ICON_TRASH}</button>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `<div class="tasks-empty">Nenhuma regra cadastrada ainda.</div>`)}
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="regras-modal-close-2">Fechar</button>
            <button class="btn-save" data-action="nova-regra">+ Nova regra</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
function htmlRegraEditor(){
  const f = regraEditForm;
  return `
    <div class="overlay" id="regras-modal-overlay">
      <div class="modal modal-lg">
        <div class="modal-head">
          <h3>${f.__isNew ? 'Nova regra de comissão' : 'Editar regra'}</h3>
          <button id="regras-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Nome</label>
            <input type="text" id="re-nome" value="${esc(f.nome)}" placeholder="Ex: Consórcio Pesado" />
          </div>
          <div class="field">
            <label class="checkbox-item"><input type="checkbox" id="re-mes-independente" ${f.mesIndependente?'checked':''} /> Mês da comissão independente do mês do lead (pra pagamentos que demoram a acontecer de verdade)</label>
          </div>
          <div class="field">
            <label>Blocos de parcelas</label>
            <div class="regra-blocos-cabecalho">
              <span>Parcelas</span><span>% da carta (por parcela)</span><span></span>
            </div>
            <div id="re-blocos-lista">
              ${f.blocos.map((b,idx)=>renderRegraLinhaBloco(b,idx,f.blocos.length>1)).join('')}
            </div>
            <button type="button" class="btn-outline" id="re-add-bloco">+ Adicionar linha</button>
          </div>
          <div class="calc-preview" id="re-preview">${htmlPreviewRegraEditor(f)}</div>
          <p class="calc-preview-note">Simulação com uma carta de R$ 100.000 — o valor real usa a carta de cada contrato.</p>
        </div>
        <div class="modal-foot">
          ${!f.__isNew ? `<button class="delete-link" id="re-delete">🗑 Excluir</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            <button class="btn-outline" id="re-cancel">‹ Voltar</button>
            <button class="btn-save" id="re-save">${f.__isNew ? 'Criar regra' : 'Salvar alterações'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
function renderRegrasModal(){
  const root = document.getElementById('modal-root');
  if(!regrasModalAberto){ root.innerHTML=''; return; }
  root.innerHTML = regraEditForm ? htmlRegraEditor() : htmlRegrasLista();
  ligarBindingsRegrasModal();
}
function ligarBindingsRegrasModal(){
  const closeBtn = document.getElementById('regras-modal-close');
  if(closeBtn) closeBtn.addEventListener('click', closeRegrasComissaoModal);
  const overlay = document.getElementById('regras-modal-overlay');
  if(overlay) overlay.addEventListener('click', (e)=>{ if(e.target.id==='regras-modal-overlay') closeRegrasComissaoModal(); });

  if(!regraEditForm){
    const closeBtn2 = document.getElementById('regras-modal-close-2');
    if(closeBtn2) closeBtn2.addEventListener('click', closeRegrasComissaoModal);
    document.querySelectorAll('[data-action="editar-regra"]').forEach(btn=>{
      btn.addEventListener('click', ()=> abrirEditarRegra(btn.dataset.regraId));
    });
    document.querySelectorAll('[data-action="excluir-regra"]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.dataset.regraId;
        const r = regrasComissao.find(x=>x.id===id);
        showConfirm({
          message: `Excluir a regra "${r?r.nome:''}"? Comissões já lançadas com ela continuam iguais, mas ela deixa de aparecer como opção pra novos contratos e leads.`,
          confirmLabel: 'Excluir',
          onConfirm: async ()=>{
            closeConfirm();
            try{
              await apiRequest('DELETE', `/regras-comissao/${id}`);
              regrasComissao = regrasComissao.filter(x=>x.id!==id);
              renderRegrasModal();
            }catch(e){
              errorMsg = e.message || 'Não foi possível excluir essa regra.';
              renderApp();
            }
          },
        });
      });
    });
    const novaBtn = document.querySelector('[data-action="nova-regra"]');
    if(novaBtn) novaBtn.addEventListener('click', abrirNovaRegra);
    return;
  }

  document.getElementById('re-nome').addEventListener('input', (e)=> regraEditForm.nome = e.target.value);
  document.getElementById('re-mes-independente').addEventListener('change', (e)=> regraEditForm.mesIndependente = e.target.checked);
  document.querySelectorAll('.regra-bloco-parcelas').forEach(inp=>{
    inp.addEventListener('input', (e)=>{
      regraEditForm.blocos[parseInt(e.target.dataset.idx,10)].parcelas = e.target.value;
      atualizarPreviewRegraEditor();
    });
  });
  document.querySelectorAll('.regra-bloco-percentual').forEach(inp=>{
    inp.addEventListener('input', (e)=>{
      regraEditForm.blocos[parseInt(e.target.dataset.idx,10)].percentual = e.target.value;
      atualizarPreviewRegraEditor();
    });
  });
  document.querySelectorAll('[data-action="remover-bloco-regra"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(regraEditForm.blocos.length<=1) return; // sempre precisa de ao menos 1 bloco
      regraEditForm.blocos.splice(parseInt(btn.dataset.idx,10),1);
      renderRegrasModal();
    });
  });
  const addBtn = document.getElementById('re-add-bloco');
  if(addBtn) addBtn.addEventListener('click', ()=>{
    regraEditForm.blocos.push({ parcelas:1, percentual:0 });
    renderRegrasModal();
  });
  document.getElementById('re-cancel').addEventListener('click', ()=>{ regraEditForm=null; renderRegrasModal(); });
  if(!regraEditForm.__isNew){
    document.getElementById('re-delete').addEventListener('click', ()=>{
      const f = regraEditForm;
      showConfirm({
        message: `Excluir a regra "${f.nome}"? Comissões já lançadas com ela continuam iguais, mas ela deixa de aparecer como opção pra novos contratos e leads.`,
        confirmLabel: 'Excluir',
        onConfirm: async ()=>{
          closeConfirm();
          try{
            await apiRequest('DELETE', `/regras-comissao/${f.id}`);
            regrasComissao = regrasComissao.filter(x=>x.id!==f.id);
            regraEditForm = null;
            renderRegrasModal();
          }catch(e){
            errorMsg = e.message || 'Não foi possível excluir essa regra.';
            renderApp();
          }
        },
      });
    });
  }
  document.getElementById('re-save').addEventListener('click', salvarRegraComissao);
}
async function salvarRegraComissao(){
  const f = regraEditForm;
  if(!f.nome || !f.nome.trim()){
    errorMsg = 'Dê um nome pra essa regra de comissão.';
    renderApp();
    return;
  }
  const blocos = f.blocos.map(b=>({ parcelas: parseInt(b.parcelas,10)||1, percentual: parseFloat(b.percentual)||0 }));
  const payload = { nome: f.nome.trim(), mesIndependente: !!f.mesIndependente, blocos };
  const saveBtn = document.getElementById('re-save');
  if(saveBtn){ saveBtn.disabled = true; saveBtn.textContent = 'Salvando…'; }
  try{
    let regra;
    if(f.__isNew){
      regra = await apiRequest('POST', '/regras-comissao', payload);
      regrasComissao = [...regrasComissao, regra].sort((a,b)=>a.ordem-b.ordem);
    }else{
      regra = await apiRequest('PUT', `/regras-comissao/${f.id}`, payload);
      regrasComissao = regrasComissao.map(r=> r.id===regra.id ? regra : r).sort((a,b)=>a.ordem-b.ordem);
    }
    regraEditForm = null;
    renderRegrasModal();
  }catch(e){
    errorMsg = e.message || 'Não foi possível salvar essa regra.';
    renderApp();
    if(saveBtn){ saveBtn.disabled=false; saveBtn.textContent = f.__isNew?'Criar regra':'Salvar alterações'; }
  }
}

/* ---------- modal de automação ---------- */
function openNewAutomacao(colunaPreSelecionada){
  automacaoModalForm = {
    __isNew:true, id:null, nome:'',
    colunaGatilhoId: colunaPreSelecionada || (board.columns[0]||{}).id || '',
    gatilhoTipo:'entrada_coluna',
    acaoTipo:'criar_tarefa',
    acaoParams:{ titulo:'', diasParaVencimento:3, diasParado:5, colunaDestinoId:(board.columns[0]||{}).id || '' },
  };
  renderAutomacaoModal();
}
function openEditAutomacao(id){
  const a = automacoes.find(x=>x.id===id);
  if(!a) return;
  automacaoModalForm = {
    __isNew:false, id:a.id, nome:a.nome, colunaGatilhoId:a.colunaGatilhoId,
    gatilhoTipo: a.gatilhoTipo || 'entrada_coluna', acaoTipo:a.acaoTipo,
    acaoParams:{ titulo:'', diasParaVencimento:3, diasParado:5, colunaDestinoId:'', ...(a.acaoParams||{}) },
  };
  renderAutomacaoModal();
}
function closeAutomacaoModal(){ automacaoModalForm = null; document.getElementById('modal-root').innerHTML=''; }

function renderAutomacaoAcaoParams(f){
  if(f.acaoTipo === 'criar_tarefa'){
    return `
      <div class="field">
        <label>Título da tarefa</label>
        <input type="text" id="am-tarefa-titulo" value="${esc(f.acaoParams.titulo||'')}" placeholder="Ex: Ligar pra confirmar interesse" />
      </div>
      <div class="field">
        <label>Vencimento (dias a partir de quando a tarefa é criada)</label>
        <input type="number" id="am-tarefa-dias" value="${f.acaoParams.diasParaVencimento||3}" min="1" />
      </div>
    `;
  }
  return `
    <div class="field">
      <label>Coluna de destino</label>
      <select id="am-coluna-destino">
        ${board.columns.map(c=>`<option value="${c.id}" ${f.acaoParams.colunaDestinoId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
      </select>
    </div>
  `;
}
function bindAutomacaoAcaoParams(){
  const tituloEl = document.getElementById('am-tarefa-titulo');
  if(tituloEl) tituloEl.addEventListener('input', (e)=> automacaoModalForm.acaoParams.titulo = e.target.value);
  const diasEl = document.getElementById('am-tarefa-dias');
  if(diasEl) diasEl.addEventListener('input', (e)=> automacaoModalForm.acaoParams.diasParaVencimento = parseInt(e.target.value,10)||3);
  const destinoEl = document.getElementById('am-coluna-destino');
  if(destinoEl) destinoEl.addEventListener('change', (e)=> automacaoModalForm.acaoParams.colunaDestinoId = e.target.value);
}

function renderAutomacaoModal(){
  const root = document.getElementById('modal-root');
  if(!automacaoModalForm){ root.innerHTML=''; return; }
  const f = automacaoModalForm;

  root.innerHTML = `
    <div class="overlay" id="automacao-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>${f.__isNew ? 'Nova automação' : 'Editar automação'}</h3>
          <button id="automacao-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Nome</label>
            <input type="text" id="am-nome" value="${esc(f.nome)}" placeholder="Ex: Agendar follow-up de propostas" />
          </div>
          <div class="field">
            <label>Coluna</label>
            <select id="am-coluna-gatilho">
              ${board.columns.map(c=>`<option value="${c.id}" ${f.colunaGatilhoId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Disparar quando</label>
            <select id="am-gatilho-tipo">
              <option value="entrada_coluna" ${f.gatilhoTipo==='entrada_coluna'?'selected':''}>O cliente entrar nessa coluna</option>
              <option value="tempo_parado" ${f.gatilhoTipo==='tempo_parado'?'selected':''}>O cliente ficar parado nessa coluna por X dias</option>
            </select>
          </div>
          <div id="am-dias-parado-wrap" style="${f.gatilhoTipo==='tempo_parado'?'':'display:none;'}">
            <div class="field">
              <label>Depois de quantos dias parado</label>
              <input type="number" id="am-dias-parado" value="${f.acaoParams.diasParado||5}" min="1" />
            </div>
            <p class="settings-page-note">Checado a cada hora pelo servidor — não é em tempo real.</p>
          </div>
          <div class="field">
            <label>Ação</label>
            <select id="am-acao-tipo">
              <option value="criar_tarefa" ${f.acaoTipo==='criar_tarefa'?'selected':''}>Criar uma tarefa</option>
              <option value="mover_coluna" ${f.acaoTipo==='mover_coluna'?'selected':''}>Mover pra outra coluna</option>
            </select>
          </div>
          <div id="am-acao-params">${renderAutomacaoAcaoParams(f)}</div>
        </div>
        <div class="modal-foot">
          ${!f.__isNew ? `<button class="delete-link" id="am-delete">🗑 Excluir</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            <button class="btn-outline" id="am-cancel">Cancelar</button>
            <button class="btn-save" id="am-save">Salvar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('automacao-modal-close').addEventListener('click', closeAutomacaoModal);
  document.getElementById('am-cancel').addEventListener('click', closeAutomacaoModal);
  document.getElementById('automacao-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='automacao-modal-overlay') closeAutomacaoModal(); });

  document.getElementById('am-nome').addEventListener('input', (e)=> automacaoModalForm.nome = e.target.value);
  document.getElementById('am-coluna-gatilho').addEventListener('change', (e)=> automacaoModalForm.colunaGatilhoId = e.target.value);
  document.getElementById('am-gatilho-tipo').addEventListener('change', (e)=>{
    automacaoModalForm.gatilhoTipo = e.target.value;
    const wrap = document.getElementById('am-dias-parado-wrap');
    if(wrap) wrap.style.display = e.target.value === 'tempo_parado' ? '' : 'none';
  });
  const diasParadoEl = document.getElementById('am-dias-parado');
  if(diasParadoEl) diasParadoEl.addEventListener('input', (e)=> automacaoModalForm.acaoParams.diasParado = parseInt(e.target.value,10)||5);
  document.getElementById('am-acao-tipo').addEventListener('change', (e)=>{
    automacaoModalForm.acaoTipo = e.target.value;
    document.getElementById('am-acao-params').innerHTML = renderAutomacaoAcaoParams(automacaoModalForm);
    bindAutomacaoAcaoParams();
  });
  bindAutomacaoAcaoParams();

  document.getElementById('am-save').addEventListener('click', salvarAutomacao);
  if(!f.__isNew){
    document.getElementById('am-delete').addEventListener('click', ()=>{
      showConfirm({
        message: 'Excluir esta automação? Ela para de rodar imediatamente.',
        onConfirm: ()=>{ excluirAutomacao(f.id); closeAutomacaoModal(); closeConfirm(); },
      });
    });
  }
}

/* ---------- modal de fluxo ---------- */
function openNewFluxo(){
  fluxoModalForm = {
    __isNew:true, id:null, nome:'',
    colunaGatilhoId: (board.columns[0]||{}).id || '',
    etapas: [{ diasAposInicio:0, tipo:'mensagem', params:{ texto:'' } }],
  };
  renderFluxoModal();
}
function openEditFluxo(id){
  const f = fluxos.find(x=>x.id===id);
  if(!f) return;
  fluxoModalForm = {
    __isNew:false, id:f.id, nome:f.nome, colunaGatilhoId:f.colunaGatilhoId,
    etapas: (f.etapas||[]).map(e=>({ diasAposInicio:e.diasAposInicio, tipo:e.tipo, params:{...(e.params||{})} })),
  };
  renderFluxoModal();
}
function closeFluxoModal(){ fluxoModalForm = null; document.getElementById('modal-root').innerHTML=''; }

/* ---------- modal: escolher entre novo cliente ou transferir existente ---------- */
function abrirEscolhaAdicionarLead(colId){
  const root = document.getElementById('modal-root');
  const coluna = board.columns.find(c=>c.id===colId);
  root.innerHTML = `
    <div class="overlay" id="add-lead-choice-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Adicionar cliente em "${esc(coluna?coluna.nome:'')}"</h3>
          <button id="add-lead-choice-close">✕</button>
        </div>
        <div class="modal-body">
          <button type="button" class="add-lead-choice-btn" id="add-lead-choice-novo">
            <span class="add-lead-choice-title">+ Novo cliente</span>
            <span class="add-lead-choice-desc">Cadastrar um cliente que ainda não existe no CRM</span>
          </button>
          <button type="button" class="add-lead-choice-btn" id="add-lead-choice-transferir">
            <span class="add-lead-choice-title">Transferir cliente existente</span>
            <span class="add-lead-choice-desc">Mover pra cá quem já está cadastrado em outra coluna ou funil</span>
          </button>
          <button type="button" class="add-lead-choice-btn" id="add-lead-choice-copiar">
            <span class="add-lead-choice-title">Copiar cliente existente</span>
            <span class="add-lead-choice-desc">Cria uma cópia aqui, mantendo o original intacto no outro lugar</span>
          </button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('add-lead-choice-close').addEventListener('click', ()=>{ root.innerHTML=''; });
  document.getElementById('add-lead-choice-overlay').addEventListener('click', (e)=>{ if(e.target.id==='add-lead-choice-overlay') root.innerHTML=''; });
  document.getElementById('add-lead-choice-novo').addEventListener('click', ()=> openNewCard(colId));
  document.getElementById('add-lead-choice-transferir').addEventListener('click', ()=> abrirPickerLeadsParaColuna(colId, 'transferir'));
  document.getElementById('add-lead-choice-copiar').addEventListener('click', ()=> abrirPickerLeadsParaColuna(colId, 'copiar'));
}

/* ---------- modal: puxar leads existentes pra uma coluna (transferir ou copiar) ---------- */
function abrirPickerLeadsParaColuna(colId, modo){
  colunaLeadsPickerColId = colId;
  colunaLeadsPickerModo = modo || 'transferir';
  colunaLeadsSelecionados = new Set();
  renderColunaLeadsPickerModal();
}
function closeColunaLeadsPickerModal(){
  colunaLeadsPickerColId = null;
  document.getElementById('modal-root').innerHTML = '';
}
async function confirmarMoverLeadsParaColuna(){
  if(colunaLeadsSelecionados.size === 0){ closeColunaLeadsPickerModal(); return; }
  const colId = colunaLeadsPickerColId;
  const copiando = colunaLeadsPickerModo === 'copiar';
  colunaLeadsMovendo = true;
  renderColunaLeadsPickerModal();
  for(const cardId of Array.from(colunaLeadsSelecionados)){
    try{
      if(copiando){
        const original = board.cards.find(c=>c.id===cardId);
        if(!original) continue;
        const copia = await apiRequest('POST', '/cards', {
          columnId: colId, cliente: original.cliente, valor: original.valor,
          temperatura: original.temperatura, telefone: original.telefone,
          obs: original.obs, mes: original.mes, mesInicioContato: original.mesInicioContato,
        });
        board.cards.push(copia);
      } else {
        const atualizado = await apiRequest('PUT', `/cards/${cardId}/move`, { columnId: colId });
        const idx = board.cards.findIndex(c=>c.id===cardId);
        if(idx>-1) board.cards[idx] = atualizado;
      }
    }catch(e){ /* segue tentando os demais selecionados */ }
  }
  colunaLeadsMovendo = false;
  closeColunaLeadsPickerModal();
  renderApp();
}
function renderColunaLeadsPickerModal(){
  const root = document.getElementById('modal-root');
  if(!colunaLeadsPickerColId){ root.innerHTML=''; return; }
  const coluna = board.columns.find(c=>c.id===colunaLeadsPickerColId);
  const copiando = colunaLeadsPickerModo === 'copiar';
  const candidatos = copiando ? board.cards.slice() : board.cards.filter(c=>c.columnId !== colunaLeadsPickerColId);

  root.innerHTML = `
    <div class="overlay" id="cl-picker-overlay">
      <div class="modal modal-lg">
        <div class="modal-head">
          <h3>${copiando ? 'Copiar' : 'Transferir'} leads pra "${esc(coluna?coluna.nome:'')}"</h3>
          <button id="cl-picker-close">✕</button>
        </div>
        <div class="modal-body">
          <p class="settings-page-note">${copiando
            ? 'Escolha quem você quer copiar pra essa coluna. O original continua intacto onde já está.'
            : 'Escolha quem você quer mover pra essa coluna agora. Dá pra pular e arrastar manualmente depois, se preferir.'}</p>
          <div class="settings-btn-row" style="margin-bottom:10px;">
            <button class="btn-outline" id="cl-selecionar-todos">Selecionar todos</button>
            <button class="btn-outline" id="cl-limpar-selecao">Limpar seleção</button>
          </div>
          <div class="disparo-lista-leads" style="max-height:320px;">
            ${candidatos.length ? candidatos.map(c=>{
              const colAtual = board.columns.find(k=>k.id===c.columnId);
              return `
                <label class="disparo-lead-item">
                  <input type="checkbox" class="cl-lead-checkbox" data-card-id="${c.id}" ${colunaLeadsSelecionados.has(c.id)?'checked':''} />
                  <span>${esc(c.cliente)||'Sem nome'} <span class="settings-page-note">${colAtual?esc(colAtual.nome):''}</span></span>
                </label>
              `;
            }).join('') : '<p class="dash-empty">Nenhum outro lead cadastrado ainda.</p>'}
          </div>
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="cl-pular">Pular por agora</button>
            <button class="btn-save" id="cl-confirmar" ${colunaLeadsMovendo?'disabled':''}>${colunaLeadsMovendo ? (copiando?'Copiando…':'Movendo…') : `${copiando?'Copiar':'Mover'} ${colunaLeadsSelecionados.size} lead(s)`}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('cl-picker-close').addEventListener('click', closeColunaLeadsPickerModal);
  document.getElementById('cl-pular').addEventListener('click', closeColunaLeadsPickerModal);
  document.getElementById('cl-picker-overlay').addEventListener('click', (e)=>{ if(e.target.id==='cl-picker-overlay') closeColunaLeadsPickerModal(); });
  document.getElementById('cl-selecionar-todos').addEventListener('click', ()=>{
    candidatos.forEach(c=>colunaLeadsSelecionados.add(c.id));
    renderColunaLeadsPickerModal();
  });
  document.getElementById('cl-limpar-selecao').addEventListener('click', ()=>{
    colunaLeadsSelecionados.clear();
    renderColunaLeadsPickerModal();
  });
  document.querySelectorAll('.cl-lead-checkbox').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      if(cb.checked) colunaLeadsSelecionados.add(cb.dataset.cardId);
      else colunaLeadsSelecionados.delete(cb.dataset.cardId);
      renderColunaLeadsPickerModal();
    });
  });
  document.getElementById('cl-confirmar').addEventListener('click', confirmarMoverLeadsParaColuna);
}

function renderFluxoEtapaParams(etapa, idx){
  if(etapa.tipo === 'mensagem'){
    return `<div class="field"><label>Mensagem</label><textarea class="fx-etapa-texto" data-idx="${idx}" rows="2" placeholder="Texto que será enviado pelo WhatsApp...">${esc((etapa.params&&etapa.params.texto)||'')}</textarea></div>`;
  }
  if(etapa.tipo === 'tarefa'){
    return `
      <div class="field-row">
        <div class="field"><label>Título da tarefa</label><input type="text" class="fx-etapa-titulo" data-idx="${idx}" value="${esc((etapa.params&&etapa.params.titulo)||'')}" placeholder="Ex: Ligar pra confirmar" /></div>
        <div class="field"><label>Vencimento (dias)</label><input type="number" class="fx-etapa-dias-venc" data-idx="${idx}" value="${(etapa.params&&etapa.params.diasParaVencimento)||1}" min="1" /></div>
      </div>
    `;
  }
  return `
    <div class="field">
      <label>Coluna de destino</label>
      <select class="fx-etapa-coluna-destino" data-idx="${idx}">
        ${board.columns.map(c=>`<option value="${c.id}" ${(etapa.params&&etapa.params.colunaDestinoId)===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
      </select>
    </div>
  `;
}
function renderFluxoEtapa(etapa, idx){
  return `
    <div class="fluxo-etapa-card">
      <div class="fluxo-etapa-head">
        <span class="fluxo-etapa-numero">${idx+1}</span>
        <div class="field fluxo-etapa-dias-field">
          <label>Dias após o início</label>
          <input type="number" class="fx-etapa-dias" data-idx="${idx}" value="${etapa.diasAposInicio}" min="0" />
        </div>
        <div class="field" style="flex:1;">
          <label>O que fazer</label>
          <select class="fx-etapa-tipo" data-idx="${idx}">
            <option value="mensagem" ${etapa.tipo==='mensagem'?'selected':''}>Enviar mensagem de WhatsApp</option>
            <option value="tarefa" ${etapa.tipo==='tarefa'?'selected':''}>Criar tarefa</option>
            <option value="mover_coluna" ${etapa.tipo==='mover_coluna'?'selected':''}>Mover pra outra coluna</option>
          </select>
        </div>
        <button type="button" class="icon-btn fx-etapa-remover" data-idx="${idx}" title="Remover etapa">${ICON_TRASH}</button>
      </div>
      ${renderFluxoEtapaParams(etapa, idx)}
    </div>
  `;
}

function bindFluxoModalEvents(){
  document.getElementById('fluxo-modal-close').addEventListener('click', closeFluxoModal);
  document.getElementById('fx-cancel').addEventListener('click', closeFluxoModal);
  document.getElementById('fluxo-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='fluxo-modal-overlay') closeFluxoModal(); });

  document.getElementById('fx-nome').addEventListener('input', (e)=> fluxoModalForm.nome = e.target.value);
  document.getElementById('fx-coluna-gatilho').addEventListener('change', (e)=> fluxoModalForm.colunaGatilhoId = e.target.value);

  document.getElementById('fx-add-etapa').addEventListener('click', ()=>{
    fluxoModalForm.etapas.push({ diasAposInicio:1, tipo:'mensagem', params:{ texto:'' } });
    renderFluxoModal();
  });
  document.querySelectorAll('.fx-etapa-remover').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      fluxoModalForm.etapas.splice(parseInt(btn.dataset.idx,10),1);
      renderFluxoModal();
    });
  });
  document.querySelectorAll('.fx-etapa-dias').forEach(el=>{
    el.addEventListener('input', (e)=>{ fluxoModalForm.etapas[parseInt(el.dataset.idx,10)].diasAposInicio = parseInt(e.target.value,10)||0; });
  });
  document.querySelectorAll('.fx-etapa-tipo').forEach(el=>{
    el.addEventListener('change', (e)=>{
      const idx = parseInt(el.dataset.idx,10);
      fluxoModalForm.etapas[idx].tipo = e.target.value;
      fluxoModalForm.etapas[idx].params = {};
      renderFluxoModal();
    });
  });
  document.querySelectorAll('.fx-etapa-texto').forEach(el=>{
    el.addEventListener('input', (e)=>{
      const idx = parseInt(el.dataset.idx,10);
      fluxoModalForm.etapas[idx].params.texto = e.target.value;
    });
  });
  document.querySelectorAll('.fx-etapa-titulo').forEach(el=>{
    el.addEventListener('input', (e)=>{
      const idx = parseInt(el.dataset.idx,10);
      fluxoModalForm.etapas[idx].params.titulo = e.target.value;
    });
  });
  document.querySelectorAll('.fx-etapa-dias-venc').forEach(el=>{
    el.addEventListener('input', (e)=>{
      const idx = parseInt(el.dataset.idx,10);
      fluxoModalForm.etapas[idx].params.diasParaVencimento = parseInt(e.target.value,10)||1;
    });
  });
  document.querySelectorAll('.fx-etapa-coluna-destino').forEach(el=>{
    el.addEventListener('change', (e)=>{
      const idx = parseInt(el.dataset.idx,10);
      fluxoModalForm.etapas[idx].params.colunaDestinoId = e.target.value;
    });
  });

  document.getElementById('fx-save').addEventListener('click', ()=>{
    const temMensagem = fluxoModalForm.etapas.some(e=>e.tipo==='mensagem');
    if(fluxoModalForm.__isNew && temMensagem){
      showConfirm({
        message: 'Este fluxo já nasce ativo e tem etapa(s) de envio de WhatsApp automático, sem revisão sua antes de mandar. Quer criar mesmo assim?',
        confirmLabel: 'Criar mesmo assim',
        onConfirm: ()=>{ salvarFluxo(); closeConfirm(); },
      });
    } else {
      salvarFluxo();
    }
  });
  if(!fluxoModalForm.__isNew){
    document.getElementById('fx-delete').addEventListener('click', ()=>{
      showConfirm({
        message: 'Excluir este fluxo? As execuções em andamento pra clientes atuais são interrompidas.',
        onConfirm: ()=>{ excluirFluxo(fluxoModalForm.id); closeFluxoModal(); closeConfirm(); },
      });
    });
  }
}

function renderFluxoModal(){
  const root = document.getElementById('modal-root');
  if(!fluxoModalForm){ root.innerHTML=''; return; }
  const f = fluxoModalForm;

  root.innerHTML = `
    <div class="overlay" id="fluxo-modal-overlay">
      <div class="modal modal-lg">
        <div class="modal-head">
          <h3>${f.__isNew ? 'Novo fluxo' : 'Editar fluxo'}</h3>
          <button id="fluxo-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Nome</label>
            <input type="text" id="fx-nome" value="${esc(f.nome)}" placeholder="Ex: Sequência de boas-vindas" />
          </div>
          <div class="field">
            <label>Começa quando o cliente entra nesta coluna</label>
            <select id="fx-coluna-gatilho">
              ${board.columns.map(c=>`<option value="${c.id}" ${f.colunaGatilhoId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
            </select>
          </div>
          <p class="settings-page-msg erro">⚠️ Etapas de "Enviar mensagem" mandam pelo WhatsApp automaticamente, sem você revisar antes. Se você responder o cliente manualmente, o fluxo fica em silêncio por 30 min naquela conversa.</p>
          <div class="fluxo-etapas-lista">
            ${f.etapas.map((etapa, idx)=>renderFluxoEtapa(etapa, idx)).join('')}
          </div>
          <button type="button" class="btn-outline" id="fx-add-etapa">+ Adicionar etapa</button>
        </div>
        <div class="modal-foot">
          ${!f.__isNew ? `<button class="delete-link" id="fx-delete">🗑 Excluir</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            <button class="btn-outline" id="fx-cancel">Cancelar</button>
            <button class="btn-save" id="fx-save">Salvar</button>
          </div>
        </div>
      </div>
    </div>
  `;
  bindFluxoModalEvents();
}

/* ---------- confirmação genérica ---------- */
function showConfirm({ message, onConfirm, confirmLabel, cancelLabel, danger }){
  confirmState = { message, onConfirm };
  const root = document.getElementById('confirm-root');
  const rotuloConfirmar = confirmLabel || 'Excluir'; // "Excluir" continua sendo o padrão, pra não quebrar quem já chama sem passar isso
  const rotuloCancelar = cancelLabel || 'Cancelar';
  const classeConfirmar = danger===false ? 'btn-primary' : 'btn-danger';
  root.innerHTML = `
    <div class="overlay" id="confirm-overlay" style="z-index:90">
      <div class="confirm-box">
        <p>${esc(message)}</p>
        <div class="confirm-actions">
          <button class="btn-outline" id="confirm-cancel">${esc(rotuloCancelar)}</button>
          <button class="${classeConfirmar}" id="confirm-ok">${esc(rotuloConfirmar)}</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
  document.getElementById('confirm-overlay').addEventListener('click', (e)=>{ if(e.target.id==='confirm-overlay') closeConfirm(); });
  document.getElementById('confirm-ok').addEventListener('click', ()=> confirmState.onConfirm());
}
function closeConfirm(){ confirmState = null; document.getElementById('confirm-root').innerHTML=''; }

/* ---------- start ---------- */
if(getToken()){
  renderAssistente();
  tratarRetornoDoGoogle();
  loadBoard();
  loadFunis();
  loadTasks();
  loadCalendarStatus();
  loadContratos();
  loadRegrasComissao();
  loadIntegracoesConfig();
  loadWhatsappStatus();
  loadInstagramStatus();
  loadTemplates();
  loadAgendamentos();
  loadMenuTriagem();
  loadCamposPersonalizados();
  loadPossiveisLeads();
  loadMetaVendas();
  loadMetaVendasEquipe();
  if(!agendaLoaded) loadAgendaMes(agendaMesAtual); // carrega em segundo plano — o Dashboard também usa eventos do Google em "Tarefas abertas"
  loadConversas();
  loadEquipe();
  loadAutomacoes();
  loadFluxos();
  loadWebhooksSaida();
}
