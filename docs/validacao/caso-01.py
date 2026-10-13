# Cálculo independente do caso-01 (docs/validacao/caso-01.md). Não usa o código TypeScript.
# Uso: python3 docs/validacao/caso-01.py
import math, json

# --- Entradas
A, T = 2000.0, 40.0
D = A / T
ca_b, ca_max, to = 1.5, 2.5, 0.60
gab_m, gab_pav = 48.0, 16
pe = 3.0
cub, fator = 2458.13, 1.30
preco_terreno = 5_500_000.0
preco_venda = 11_000.0
efic, nc_pct, nc_eq = 0.80, 0.40, 0.50
itbi, reg, proj, mkt, corr, adm, cont, imp = 0.03, 0.01, 0.04, 0.03, 0.05, 0.03, 0.05, 0.04
Ma, Mo, Mv, L = 6, 30, 24, 0.30
sinal, mensais, chaves_pct = 0.10, 0.20, 0.70

def recuo_lat(H): return max(H/12, 2.5)
def recuo_fun(H): return max(H/12, 2.5)
def recuo_fr(H): return 5.0

def potencial(ca):
    alvo = A * ca
    proj_to = A * to
    maxpav = min(gab_pav, math.floor(gab_m/pe + 1e-9))
    opts = []
    for n in range(1, maxpav+1):
        H = n*pe
        larg = T - 2*recuo_lat(H)
        prof = D - recuo_fr(H) - recuo_fun(H)
        pr = max(0,larg)*max(0,prof)
        p = min(proj_to, pr)
        opts.append((n, H, p, pr, p*n))
    for o in opts:
        if o[4] >= alvo - 1e-9:
            return dict(n=o[0], H=o[1], proj=o[2], proj_recuos=o[3], comp=alvo, alvo=alvo)
    best = max(opts, key=lambda o: o[4])
    return dict(n=best[0], H=best[1], proj=best[2], proj_recuos=best[3], comp=best[4], alvo=alvo)

def financeiro(pot, dpreco=0, dcusto=0, dvendas=0):
    comp = pot["comp"]
    nc = comp*nc_pct
    eq = comp + nc*nc_eq
    priv = comp*efic
    vgv = priv*preco_venda*(1+dpreco)
    receita = vgv
    construcao = eq*cub*fator*(1+dcusto)
    c = dict(
        terreno=preco_terreno,
        itbi_registro=preco_terreno*(itbi+reg),
        construcao=construcao,
        projetos=construcao*proj,
        outorga=0.0,
        marketing=receita*mkt,
        corretagem=receita*corr,
        administracao=construcao*adm,
        contingencia=construcao*cont,
        impostos=receita*imp,
    )
    total = sum(c.values())
    mv = max(1, round(Mv*(1+dvendas)))
    lanc = Ma+1; fim = Ma+Mo; ch = fim+1
    last = max(ch, Ma+mv)
    rec = [0.0]*(last+1)
    vend = [L + (1-L)/mv if i==0 else (1-L)/mv for i in range(mv)]
    for i,f in enumerate(vend):
        m = lanc+i
        rec[m] += f*sinal
        k = fim - m
        if k > 0:
            for t in range(m+1, fim+1): rec[t] += f*mensais/k
        else:
            rec[max(ch,m)] += f*mensais
        rec[max(ch,m)] += f*chaves_pct
    ent = [r*receita for r in rec]
    sai = [0.0]*(last+1)
    sai[0] += c["terreno"]+c["itbi_registro"]
    for t in range(1, Ma+1): sai[t] += c["projetos"]/Ma
    sai[Ma] += c["outorga"]
    w = [math.sin(math.pi*(i+0.5)/Mo) for i in range(Mo)]
    sw = sum(w); w = [x/sw for x in w]
    obra = c["construcao"]+c["administracao"]+c["contingencia"]
    for i,x in enumerate(w): sai[lanc+i] += obra*x
    for i,f in enumerate(vend): sai[lanc+i] += (c["marketing"]+c["corretagem"])*f
    for t in range(last+1): sai[t] += rec[t]*c["impostos"]
    saldo = [e-s for e,s in zip(ent,sai)]
    acc=[]; a=0
    for s in saldo: a+=s; acc.append(a)
    lucro = sum(saldo)
    expo = max(0, -min(acc))
    # TIR por bisseção em [lo, hi] onde o VPL muda de sinal (busca grossa)
    def npv(r): return sum(v/(1+r)**t for t,v in enumerate(saldo))
    lo=None
    r=-0.9
    prev=npv(r)
    while r < 1.0:
        r2=r+0.005; v2=npv(r2)
        if (prev>0) != (v2>0): lo=(r,r2); break
        r=r2; prev=v2
    tir=None
    if lo:
        a_,b_=lo
        for _ in range(300):
            m_=(a_+b_)/2
            if (npv(m_)>0)==(npv(a_)>0): a_=m_
            else: b_=m_
        tir=(a_+b_)/2
    neg=[i for i,v in enumerate(acc) if v < -1e-9]
    pb = 0 if not neg else (None if neg[-1]==len(acc)-1 else neg[-1]+1)
    return dict(vgv=vgv, receita=receita, custos=c, custo_total=total, lucro=lucro,
                margem=lucro/vgv, exposicao=expo, roi=lucro/expo if expo>0 else None,
                tir_m=tir, tir_a=(1+tir)**12-1 if tir is not None else None, payback=pb,
                prazo_total=last, mv=mv, acc_min_mes=acc.index(min(acc)))

pot = potencial(ca_b)
comp=pot["comp"]
out = dict(potencial=dict(pot, nao_computavel=comp*nc_pct, construida=comp*(1+nc_pct), equivalente=comp+comp*nc_pct*nc_eq, privativa=comp*efic),
           base=financeiro(pot),
           conservador=financeiro(pot,-0.10,0.10,0.5),
           otimista=financeiro(pot,0.05,-0.05,-0.25))
print(json.dumps(out, indent=1, default=float))
