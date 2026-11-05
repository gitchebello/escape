// Liga da Quadra: lê partidas.csv, calcula rankings e conquistas e desenha a página.
const ORDEM = ['Rebello', 'Pougy', 'Dana', 'Cohen'];

const CATEGORIAS = [
  { id: 'vitorias', nome: 'Vitórias', nota: 'Partidas vencidas pela dupla.', unidade: 'vitórias' },
  { id: 'pontos', nome: 'Pontos marcados', nota: 'Points Scored, somados em todas as partidas.', unidade: 'pontos' },
  { id: 'nice_serves', nome: 'Nice serves', nota: 'Nice Serves acertados.', unidade: 'nice serves' },
  { id: 'aces', nome: 'Aces', nota: 'Service Aces e Return Aces juntos.', unidade: 'aces' },
  { id: 'winners', nome: 'Winners', nota: 'Winner Shots: bolas que decidiram o ponto.', unidade: 'winners' },
  { id: 'energia', nome: 'Energia ganha', nota: 'Energy Earned somada.', unidade: 'de energia' },
  { id: 'danos_raquete', nome: 'Raquete preservada', nota: 'Cada X abaixo do nome conta um dano. Menos é melhor.', unidade: 'danos', menorMelhor: true },
];

const CAMPOS_NUMERICOS = ['venceu', 'pontos', 'nice_serves', 'aces', 'winners', 'energia', 'danos_raquete'];

function lerCsv(texto) {
  const [cab, ...linhas] = texto.trim().split(/\r?\n/).map((l) => l.split(','));
  return linhas.map((cols) => {
    const r = Object.fromEntries(cab.map((c, i) => [c, cols[i].trim()]));
    CAMPOS_NUMERICOS.forEach((c) => { r[c] = Number(r[c]); });
    return r;
  });
}

const fmt = (n) => Number(n).toLocaleString('pt-BR');
const soma = (rows, campo) => rows.reduce((t, r) => t + r[campo], 0);

function calcular(rows) {
  const fotos = [...new Set(rows.map((r) => r.foto))];
  const nomes = [...new Set(rows.map((r) => r.jogador))]
    .sort((a, b) => (ORDEM.indexOf(a) + 99) % 100 - (ORDEM.indexOf(b) + 99) % 100);
  const timeDe = (r) => rows.filter((x) => x.foto === r.foto && x.lado === r.lado);

  const jogadores = nomes.map((nome) => {
    const dele = rows.filter((r) => r.jogador === nome);
    const vitorias = soma(dele, 'venceu');
    const pontosDupla = dele.reduce((t, r) => t + soma(timeDe(r), 'pontos'), 0);
    const personagens = [...new Set(dele.map((r) => r.personagem))].map((p) => {
      const com = dele.filter((r) => r.personagem === p);
      const v = soma(com, 'venceu');
      return { nome: p, v, d: com.length - v };
    });
    const j = { nome, partidas: dele.length, vitorias, derrotas: dele.length - vitorias, pctDupla: soma(dele, 'pontos') / (pontosDupla || 1), personagens };
    CATEGORIAS.filter((c) => c.id !== 'vitorias').forEach((c) => { j[c.id] = soma(dele, c.id); });
    return j;
  });

  // Em cada categoria o último recebe 1 ponto e cada posição acima recebe 1 a mais; empate divide.
  const n = jogadores.length;
  const rankings = CATEGORIAS.map((cat) => {
    const dir = cat.menorMelhor ? 1 : -1;
    const ord = [...jogadores].sort((a, b) => dir * (a[cat.id] - b[cat.id]));
    const linhas = ord.map((j) => {
      const iguais = ord.filter((o) => o[cat.id] === j[cat.id]);
      const primeiro = ord.indexOf(iguais[0]);
      const pts = iguais.reduce((t, o) => t + (n - ord.indexOf(o)), 0) / iguais.length;
      return { jogador: j.nome, valor: j[cat.id], posicao: primeiro + 1, pts };
    });
    return { ...cat, linhas };
  });

  const placar = jogadores.map((j) => {
    const dele = rankings.map((c) => ({ ...c.linhas.find((l) => l.jogador === j.nome), cat: c }));
    return { nome: j.nome, total: soma(dele, 'pts'), lideradas: dele.filter((d) => d.posicao === 1).length, porCategoria: dele };
  }).sort((a, b) => b.total - a.total);

  const partidas = fotos.map((foto) => {
    const da = rows.filter((r) => r.foto === foto);
    const venc = da.filter((r) => r.venceu);
    const perd = da.filter((r) => !r.venceu);
    const destaque = [...da].sort((a, b) => b.pontos - a.pontos || b.winners - a.winners || b.energia - a.energia)[0];
    return { foto, venc, perd, pv: soma(venc, 'pontos'), pp: soma(perd, 'pontos'), destaque };
  });

  return { rows, fotos, jogadores, rankings, placar, partidas, conquistas: conquistas(rows, jogadores, partidas, fotos), maximo: n * CATEGORIAS.length };
}

function conquistas(rows, jogadores, partidas, fotos) {
  const recorde = (campo, base = rows) => {
    const max = Math.max(...base.map((r) => r[campo]));
    return { max, donos: base.filter((r) => r[campo] === max) };
  };
  const detalhe = (donos) => donos.map((r) => `${r.personagem}, partida ${r.foto}`).join(' · ');
  const deRecorde = (titulo, regra, campo, unidade, base) => {
    const { max, donos } = recorde(campo, base);
    return { titulo, regra, donos: [...new Set(donos.map((r) => r.jogador))], valor: `${fmt(max)} ${unidade}`, detalhe: detalhe(donos) };
  };

  const lista = [
    deRecorde('Partida de gala', 'Mais pontos em uma partida', 'pontos', 'pontos'),
    deRecorde('Chuva de winners', 'Mais winners em uma partida', 'winners', 'winners'),
    deRecorde('Ace atrás de ace', 'Mais aces em uma partida', 'aces', 'aces'),
    deRecorde('Saque de respeito', 'Mais nice serves em uma partida', 'nice_serves', 'nice serves'),
    deRecorde('Usina de energia', 'Mais energia em uma partida', 'energia', 'de energia'),
    deRecorde('Herói da derrota', 'Mais pontos em uma partida perdida', 'pontos', 'pontos', rows.filter((r) => !r.venceu)),
  ];

  const destaques = jogadores.map((j) => ({ nome: j.nome, qtd: partidas.filter((p) => p.destaque.jogador === j.nome).length }));
  const maxD = Math.max(...destaques.map((d) => d.qtd));
  lista.push({ titulo: 'Melhor em quadra', regra: 'Mais vezes destaque da partida', donos: destaques.filter((d) => d.qtd === maxD).map((d) => d.nome), valor: `${maxD} de ${fotos.length} partidas`, detalhe: 'Mais pontos; empate vai para winners e energia' });

  const duplas = {};
  rows.forEach((r) => {
    const par = rows.filter((x) => x.foto === r.foto && x.lado === r.lado).map((x) => x.jogador).sort().join(' + ');
    duplas[par] = duplas[par] || { par, v: 0, d: 0, fotos: new Set() };
    if (!duplas[par].fotos.has(r.foto)) { duplas[par].fotos.add(r.foto); duplas[par][r.venceu ? 'v' : 'd'] += 1; }
  });
  const invictas = Object.values(duplas).filter((d) => d.d === 0).sort((a, b) => b.v - a.v);
  if (invictas.length) lista.push({ titulo: 'Dupla invicta', regra: 'Mais vitórias juntos, sem nenhuma derrota', donos: invictas[0].par.split(' + '), valor: `${invictas[0].v}–0`, detalhe: `${invictas[0].v} partidas juntos` });

  const maxPct = Math.max(...jogadores.map((j) => j.pctDupla));
  lista.push({ titulo: 'Carregou a dupla', regra: 'Maior parte dos pontos da própria dupla', donos: jogadores.filter((j) => j.pctDupla === maxPct).map((j) => j.nome), valor: `${Math.round(maxPct * 100)}% dos pontos`, detalhe: 'Soma de todas as partidas' });

  const minDano = Math.min(...jogadores.map((j) => j.danos_raquete));
  lista.push({ titulo: 'Raquete intacta', regra: 'Menos danos na raquete', donos: jogadores.filter((j) => j.danos_raquete === minDano).map((j) => j.nome), valor: `${fmt(minDano)} ${minDano === 1 ? 'dano' : 'danos'}`, detalhe: 'Soma de todas as partidas' });

  const maxP = Math.max(...jogadores.map((j) => j.personagens.length));
  const camaleao = jogadores.filter((j) => j.personagens.length === maxP);
  lista.push({ titulo: 'Camaleão', regra: 'Mais personagens diferentes', donos: camaleao.map((j) => j.nome), valor: `${maxP} personagens`, detalhe: camaleao.map((j) => j.personagens.map((p) => p.nome).join(', ')).join(' · ') });

  const zerados = rows.filter((r) => r.pontos === 0);
  lista.push({ titulo: 'Passeio na quadra', regra: 'Partida inteira sem marcar ponto', zoeira: true, donos: [...new Set(zerados.map((r) => r.jogador))], valor: zerados.length ? 'Zero pontos' : 'Ninguém ainda', detalhe: detalhe(zerados) });

  return lista;
}

/* ---------- Desenho ---------- */

function h(tag, classe, ...filhos) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  filhos.flat().forEach((f) => { if (f !== null && f !== undefined) el.append(f); });
  return el;
}

const corDe = (nome) => {
  const i = ORDEM.indexOf(nome);
  return i >= 0 ? `var(--p${i})` : 'var(--giz)';
};

function bola(nomes, zoeira) {
  const b = h('span', `bola${zoeira ? ' bola-zoeira' : ''}`, nomes.length === 1 ? nomes[0][0] : String(nomes.length));
  b.style.setProperty('--cor', nomes.length === 1 ? corDe(nomes[0]) : 'var(--bola)');
  b.setAttribute('aria-hidden', 'true');
  return b;
}

const ordinal = (p) => `${p}º`;

function desenhar(d) {
  const lider = d.placar[0];
  const heroi = document.getElementById('mvp-nome');
  heroi.textContent = lider.nome;
  heroi.style.setProperty('--cor', corDe(lider.nome));
  document.getElementById('mvp-frase').textContent =
    `${fmt(lider.total)} de ${fmt(d.maximo)} pontos possíveis e liderança em ${lider.lideradas} das ${CATEGORIAS.length} categorias, depois de ${d.fotos.length} partidas.`;

  document.getElementById('placar').replaceChildren(...d.placar.map((p, i) => {
    const barra = h('span', 'placar-barra');
    barra.style.width = `${(p.total / d.maximo) * 100}%`;
    const linha = h('li', 'placar-linha', h('span', 'placar-pos', ordinal(i + 1)), h('span', 'placar-nome', p.nome), h('span', 'placar-trilho', barra), h('span', 'placar-total', fmt(p.total)));
    linha.style.setProperty('--cor', corDe(p.nome));
    return linha;
  }));

  document.getElementById('rankings').replaceChildren(...d.rankings.map((cat) => {
    const maior = Math.max(...cat.linhas.map((l) => l.valor), 1);
    const lista = h('ol', 'rank', cat.linhas.map((l) => {
      const barra = h('span', 'rank-barra');
      barra.style.width = l.valor ? `${(l.valor / maior) * 100}%` : '3px';
      const linha = h('li', `rank-linha${l.posicao === 1 ? ' rank-lider' : ''}`, h('span', 'rank-pos', ordinal(l.posicao)), h('span', 'rank-nome', l.jogador), h('span', 'rank-trilho', barra), h('span', 'rank-valor', fmt(l.valor)));
      linha.style.setProperty('--cor', corDe(l.jogador));
      return linha;
    }));
    return h('article', `cartao${cat.id === 'vitorias' ? ' cartao-largo' : ''}`, h('h3', '', cat.nome), h('p', 'nota', cat.nota), lista);
  }));

  document.getElementById('fichas').replaceChildren(...d.placar.map((p, i) => {
    const j = d.jogadores.find((x) => x.nome === p.nome);
    const delas = d.conquistas.filter((c) => c.donos.includes(p.nome));
    const linhas = h('ul', 'ficha-cats', p.porCategoria.map((c) => h('li', `ficha-cat${c.posicao === 1 ? ' ficha-ouro' : ''}`,
      h('span', 'ficha-pos', ordinal(c.posicao)), h('span', 'ficha-rot', c.cat.nome), h('span', 'ficha-val', fmt(c.valor)))));
    const cartao = h('article', 'cartao ficha',
      h('header', 'ficha-topo', bola([p.nome]), h('div', 'ficha-id', h('h3', '', p.nome), h('p', 'nota', `${ordinal(i + 1)} no geral · ${fmt(p.total)} pontos de MVP`)), h('span', 'ficha-vd', `${j.vitorias}–${j.derrotas}`)),
      h('p', 'ficha-pers', j.personagens.map((x) => `${x.nome} ${x.v}–${x.d}`).join(' · ')),
      linhas,
      h('div', 'selos', delas.map((c) => h('span', `selo${c.zoeira ? ' selo-zoeira' : ''}`, c.titulo))));
    cartao.style.setProperty('--cor', corDe(p.nome));
    return cartao;
  }));

  document.getElementById('conquistas').replaceChildren(...d.conquistas.map((c) => {
    const cartao = h('article', `cartao conquista${c.zoeira ? ' conquista-zoeira' : ''}`,
      bola(c.donos.length ? c.donos : ['?'], c.zoeira),
      h('div', 'conquista-corpo', h('h3', '', c.titulo), h('p', 'nota', c.regra),
        h('p', 'conquista-dono', c.donos.join(' e ') || 'Em aberto'),
        h('p', 'conquista-valor', c.valor), h('p', 'nota conquista-det', c.detalhe)));
    return cartao;
  }));

  const dupla = (lista) => lista.map((r) => `${r.jogador} (${r.personagem})`).join(' e ');
  document.getElementById('partidas').replaceChildren(...d.partidas.map((p) => {
    const dest = h('td', 'dest', p.destaque.jogador);
    dest.style.setProperty('--cor', corDe(p.destaque.jogador));
    return h('tr', '', h('td', 'num', p.foto), h('td', '', dupla(p.venc)), h('td', 'num forte', `${p.pv}–${p.pp}`), h('td', '', dupla(p.perd)), dest);
  }));
}

if (typeof document !== 'undefined') {
  fetch('partidas.csv', { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then((t) => { desenhar(calcular(lerCsv(t))); })
    .catch(() => { document.getElementById('mvp-frase').textContent = 'Não consegui ler partidas.csv. Abra a página pelo servidor local.'; });
} else {
  module.exports = { lerCsv, calcular };
}
