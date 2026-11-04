import sys,collections,os
d=sys.argv[1]
par=collections.defaultdict(set); name={}
for l in open(os.path.join(d,'partof_inclusion_relation_list.txt'),encoding='utf-8').read().splitlines()[1:]:
    p,pn,c,cn=l.split('\t'); par[c].add(p); name[p]=pn; name[c]=cn
kids=collections.defaultdict(set)
for c,ps in par.items():
    for p in ps: kids[p].add(c)
roots=[n for n in name if n not in par]
def show(n,dep,maxd):
    print('  '*dep+n,name[n],len(kids[n]))
    if dep<maxd:
        for k in sorted(kids[n],key=lambda x:name[x]): show(k,dep+1,maxd)
for r in roots: show(r,0,2)
