# Specifica del motore di gioco (bozza 1, 2026-11-25)

Scopo: fissare **regole e decisioni di architettura** prima di scrivere codice. Fonte delle regole: Null Signal Games, Comprehensive Rules v26.03 (CR) in `public/` (i riferimenti `CR x.y.z` rimandano a quel documento). Ambito iniziale: le **77 carte di System Gateway** (set `system_gateway`, mazzi introduttivi inclusi), partite Runner contro Corp, **solo logica** (nessuna UI, nessun bot, nessun online).

Che cosa è letto e cosa no: ho letto per intero le sezioni su struttura del turno, azioni, run, breach/accesso, installazione/gioco, sequenza di uso delle abilità, checkpoint, danno, tag, bad publicity, link, trace, load/empty/charge/mark/sabotage e l'appendice con le tabelle dei timing (CR 5, 6, 7, 8.5–8.6, 9.2, 9.5.7, 9.6.15, 9.7.2, 9.8, 10.3–10.12, 11). **Non ancora letti a fondo** (da fare quando una carta li richiede): 1.13 hosting, 1.15 target, 1.16 costi (solo i titoli), 8.5.6 "trash like cards", 9.4 abilità statiche, 9.6.1–14 condizioni di innesco, 9.9 interrupt/replacement, 9.10 effetti persistenti, 9.11–9.12 terminologia.

## 1. Decisioni di architettura proposte

1. **Motore in TypeScript puro**, cartella `src/app/engine/`, senza Angular né DOM. La UI (DOM o Pixi) e il bot lo useranno dall'esterno.
2. **Stato = dati semplici serializzabili** (JSON): zone, carte (oggetti con id univoco), contatori, crediti, clic, tag, ecc. Nessuna classe con comportamento nello stato. Questo dà salvataggio, replay, test e, in futuro, partite online.
3. **Comandi ed eventi.** Il motore espone `apply(state, command) → { state, events }`. I comandi sono le scelte dei giocatori ("gioca la carta X", "inizia una incursione sul server Y", "passa"); gli eventi descrivono ciò che è successo (servono alla UI, ai trigger e ai test). Lo stato è trattato come immutabile.
4. **Una sola interfaccia per le decisioni:** quando il gioco attende una scelta, lo stato contiene una `pendingChoice` (chi decide, che opzioni sono legali). Umano, bot e test rispondono allo stesso modo. Esiste una funzione `legalCommands(state)`.
5. **Oggetti, non carte** (CR 1.12): una carta che cambia zona diventa un nuovo oggetto, ed è per questo che "una volta per turno" si azzera. Ogni oggetto ha `objectId` nuovo ad ogni cambio di zona; la carta fisica ha `cardId` stabile.
6. **Timing come macchina a stati** che segue l'appendice CR 11 passo per passo (turno → fasi → azioni; run → 6 fasi; breach; accesso). I passi sono dati (una tabella di step) più funzioni che li eseguono, non codice sparso.
7. **Finestre di priorità** (action window, paid ability window `(P)(R)(S)`, reaction window, interrupt window, mid-access window): implementate fedelmente, ma **si passano da sole quando nessuno ha opzioni legali** (altrimenti ogni partita richiederebbe decine di "passa"). Un flag permette ai test di richiedere ogni finestra.
8. **Checkpoint** (CR 10.3) come funzione unica, chiamata nei punti previsti (quando un giocatore riceve priorità, dopo il pagamento di un costo, dopo ogni istruzione). Qui avvengono: innesco delle abilità condizionali, scadenza degli effetti, vittoria a 7 punti, trash di unici/console doppie, memoria in eccesso, server/posizioni vuoti, ecc.
9. **Abilità = descrizioni composte da mattoncini** (vedi §4): ogni abilità ha tipo (statica, a pagamento, condizionale, di gioco, subroutine, interrupt), costo, condizione di innesco e una lista di istruzioni. Le istruzioni sono funzioni tipizzate riusabili; per le carte anomale c'è la via di fuga di una funzione personalizzata. **Le definizioni sono codice TypeScript scritto a mano, indicizzato per `card_id` (slug)** (non per testo: parsarlo è fragile). Non esiste un parser di testo.
10. **Modificatori (effetti continui) calcolati, non memorizzati:** forza, costo, memoria, limite di mano si ricavano da una pipeline "valore base + modificatori attivi" ad ogni lettura.
11. **Caso e informazione nascosta:** un generatore pseudocasuale con seme nello stato (partite riproducibili); `view(state, player)` produce la vista di un giocatore con mano/mazzo avversari nascosti.
12. **Identificatori di carta:** il motore conosce le carte per `card_id` (slug) e legge i dati base (tipo, costi, forza…) dal modello `Card` dell'app; le stampe diverse della stessa carta sono equivalenti per il motore.

## 2. Riassunto delle regole che il motore deve coprire

### 2.1 Preparazione e fine partita (CR 1.6, 1.7)
- Ognuno: identità, mazzo mescolato, 5 crediti, 5 carte in mano, mulligan facoltativo (prima la Corp, poi il Runner; la seconda mano resta). Comincia la Corp.
- Vittoria: 7 punti obiettivo nell'area punteggio (CR 1.17.2, controllato al checkpoint); Corp vince se il Runner è **flatlined** (danno > carte in grip, o limite di mano < 0 all'inizio dello scarto); Runner vince se la Corp deve pescare da R&S vuota. Se entrambi vincono insieme: pareggio.
- I mazzi introduttivi usano le identità "learning" (The Catalyst / The Syndicate) con testo "Solo per la partita introduttiva" (CR 1.4.1a).

### 2.2 Turno (CR 5, 11.2, 11.3)
- **Corp:** 3 clic. Fasi: pesca (clic assegnati → finestra (P)(R)(S) → ricarica crediti ricorrenti → "inizia il turno" → pesca 1) → azione (finestra (P)(R)(S); se ha clic, un'azione; ripeti) → scarto (scarta fino al limite, finestra (P)(R), perde i clic, "il turno termina").
- **Runner:** 4 clic. Fasi: azione (clic, finestra (P)(R), ricarica ricorrenti, "inizia il turno", ciclo azione) → scarto. Il Runner non ha fase di pesca.
- **Azioni di base** (CR 5.2.6, 5.2.7): *entrambi:* [click]: ottieni 1 credito; [click]: pesca 1; *Corp:* installa (agenda/asset/upgrade/ICE da QG), gioca 1 operazione, [click]+1 credito: avanza 1 carta installata, [click]+2 crediti: elimina 1 risorsa (se il Runner ha un tag), 3 clic: epura i virus; *Runner:* installa programma/risorsa/hardware dal grip, gioca 1 evento, [click]: effettua un'incursione su un server, [click]+2 crediti: rimuovi 1 tag.
- Un'azione iniziata va completata prima di ogni altra cosa (CR 5.2.2). Le azioni sono abilità a pagamento il cui costo inizia con [click].
- Limite di mano iniziale: 5 per entrambi (CR 5.5.3); ogni danno core lo riduce di 1; si scarta alla fase di scarto (le carte scartate dal QG vanno negli Archivi a faccia in giù).

### 2.3 Run (CR 6, 11.4)
Fasi: **Inizio** (annuncio server e costi aggiuntivi; riempimento del fondo cattiva pubblicità; posizione = ICE più esterno; finestra (P)(R)) → **Avvicinamento** a un ICE (finestra (P)(R) dove la Corp può **materializzare solo quell'ICE**) → **Incontro** (se l'ICE è materializzato: finestra (P) in cui il Runner infrange subroutine; poi la Corp risolve in ordine le subroutine non infrante) → **Movimento** (il Runner supera l'ICE; puoi **disconnettersi**; si sposta verso l'interno; se c'è un altro ICE torna all'avvicinamento, altrimenti "si avvicina al server") → **Successo** (la run è riuscita, si fa il *breach* del server) → **Fine run** (chiude le finestre aperte, svuota il fondo cattiva pubblicità, dichiara la run non riuscita se non ha raggiunto il successo).
- "Termina l'incursione" (CR 6.1.4) salta alla fase finale chiudendo le finestre aperte senza avviare nuove strutture; vale anche per accessi e breach in corso.
- Infrangere (CR 6.5.7, 9.8): ogni subroutine è "non infranta" a inizio incontro; l'ICE è **infranto completamente** la prima volta che tutte lo sono (un ICE senza subroutine è infranto all'inizio della finestra). Bypass: l'incontro si interrompe e si supera l'ICE.
- Una carta come *Funhouse*/*Ping* innesca "quando il Runner incontra/si avvicina": l'ICE deve essere materializzato per l'incontro (CR 6.4.4, 6.5).

### 2.4 Breach e accesso (CR 7, 11.5, 11.6)
- Candidati: carte nella radice del server; per il QG le carte in mano; per R&S la carta in cima; per gli Archivi gli scarti (prima si girano a faccia in su).
- Per QG/R&S il Runner sceglie quante carte accedere in base al **limite di accesso casuale** (1 di default; "accedi a N carte aggiuntive" lo alza all'inizio del breach); le carte in mano sono scelte a caso.
- Accesso: il Runner può usare **una** abilità "mid-access" (compresa l'eliminazione pagando il costo di eliminazione); se la carta è un obiettivo, **lo ruba** (CR 7.2).

### 2.5 Installazione, gioco, materializzazione, riscossione
- **Installare** (CR 8.5.16): metti la carta nell'area di gioco → scegli destinazione/host → elimina le carte "uguali" (unici, asset/upgrade nello stesso server remoto) → paga il costo (checkpoint) → la carta è installata (e attiva se a faccia in su) → scattano i "quando installi". Il Corp installa a faccia in giù, il Runner a faccia in su. ICE: costo di installazione = 1 credito per ogni ICE già installato a protezione di quel server (CR 8.5.x, verificato).
- **Giocare evento/operazione** (CR 8.6.7): a faccia in su → paga il costo (checkpoint) → diventa attiva → condizioni di gioco → risolvi → elimina la carta → condizioni "dopo la risoluzione".
- **Materializzare** (CR 8.1): solo in finestre (R); paga il costo; la carta diventa attiva. **Riscuotere** agenda (finestre (S)): servono i segnalini progresso pari al requisito; l'agenda va nell'area punteggio (CR 1.17).
- **Avanzare** una carta installata: [click]+1 credito (CR 1.18).
- **Memoria** del Runner: il limite di partenza è scritto sull'identità (CR 2.10; di solito 4 [mu]); se il costo totale dei programmi lo supera, al checkpoint se ne eliminano (CR 1.20, 10.3.1e).

### 2.6 Abilità, priorità e risoluzione (CR 9)
- Tipi: **statiche**, **a pagamento** (costo : effetto), **condizionali** (quando/dopo/ogni volta che/prima volta…), **di gioco** (eventi/operazioni), **subroutine** (solo ICE), **interrupt/replacement** (CR 9.9, SG ne ha pochissimi).
- Uso di un'abilità a pagamento (CR 9.5.7): annuncia → paga il costo (checkpoint) → annuncia i bersagli della prima istruzione → finestra interrupt → risolvi → checkpoint → prossima istruzione.
- Abilità condizionale (CR 9.6.15): le abilità che hanno soddisfatto la condizione diventano *pendenti* al checkpoint e si aprono finestre di reazione; prima il giocatore attivo, poi l'altro; le obbligatorie vanno risolte, le facoltative si possono lasciar cadere.
- Subroutine (CR 9.8.10): imminente → finestra interrupt (possono impedirla) → istruzioni come sopra. Si risolvono in ordine, senza finestre di priorità.
- Regole d'oro: "non può" batte "può" (CR 1.2.2); senza "se possibile" si esegue il più possibile (1.2.4).

### 2.7 Altri sistemi
- **Danno** (CR 10.4): meat/net = si eliminano a caso N carte dal grip; core = come sopra e −1 al limite di mano; danno > carte in grip = flatline. Più danni nello stesso colpo: eliminazione simultanea.
- **Tag** (CR 10.5): "ha un tag" = almeno 1; azioni di base collegate (Corp elimina risorsa, Runner rimuove tag).
- **Cattiva pubblicità** (CR 10.6): ad ogni run il Runner riceve nel "fondo" 1 credito per ogni cattiva pubblicità della Corp; a fine run il resto va via.
- **Trace** (CR 10.8): la Corp spende crediti (forza = base + crediti), poi il Runner (link + crediti); riuscita se la forza della trace è **maggiore** del link. In SG non ci sono trace; il sistema è per dopo.
- **Contatori/hosting:** segnalini virus, potere, progresso, obiettivo; *load* (colloca) e *empty* (svuotata), *charge* (aggiungi 1 potere a una carta che ne ha già uno), *mark* (un solo server designato per il turno; se non c'è, uno centrale a caso), *sabotage N* (la Corp elimina N carte da QG e/o cima R&S, mai dalle zone vuote oltre il possibile).

## 3. Corrispondenza con le carte di System Gateway
Frequenza approssimativa dei concetti nei 77 testi (una carta può contare più volte):

| Concetto | Carte | Concetto | Carte |
|---|---|---|---|
| ottenere/prendere crediti | 21 | forza +N (rompighiaccio) | 9 |
| installare | 14 | segnalini ospitati come costo | 9 |
| clic (perdere/guadagnare) | 13 | danni (net/meat/core) | 7 |
| pescare | 11 | materializzare/smaterializzare | 7 |
| colloca/carica segnalini | 11 | prima volta/una volta per turno | 7 |
| infrangere subroutine | 10 | limite mano / memoria | 7 |
| termina l'incursione | 10 | eliminare carte installate | 6 |
| tag | 10 | virus/epurare | 6 |
| innesco su riscossione/furto | 10 | cercare e rimescolare | 5 |
| eventi con "Effettua un'incursione" | 4 | far progredire | 5 |

Meccaniche fuori dall'ordinario che il motore deve prevedere subito: ICE **bioroide** (Ansel/Brân: "perdi [click]: infrangi" usabile solo dal Runner); eventi con scelta della Corp (*Wildcat Strike*); *Mutual Favor* e *Hansei Review* (cerca/eliminazione in mano); *Pharos* (avanzabile con forza dipendente dai segnalini); carte "Limite 1 per mazzo"; console (una sola per giocatore, la più recente sostituisce); identità con abilità "prima volta ogni turno"; l'identità The Catalyst/The Syndicate senza effetto.
Nei testi NetrunnerDB ho già visto un'anomalia: *Blood in the Water* (33039, Midnight Sun) ha il testo troncato; ogni carta andrà verificata con il testo ufficiale.

## 4. Mattoncini (primitive) previsti
Costi: spendere clic, spendere crediti (anche da carta), eliminare dalla mano/dal grip, subire danno, rimuovere segnalino ospitato, eliminare questa carta. Istruzioni: ottieni/perdi/prendi crediti, pesca, colloca/rimuovi segnalini, eliminare carta/e, installare (con sconto/ignorando costi), materializzare/smaterializzare, effettuare un'incursione, infliggere danno/tag, scegliere server/carta, cercare e rimescolare, mettere da parte, rivelare, accedere carte aggiuntive, ruotare l'esito dell'accesso, scambiare ICE, modificare forza/costo/limite di mano, terminare l'incursione, infrangere subroutine, sabotare. Condizioni: quando/dopo/ogni volta che [evento], prima volta nel turno, una volta per turno, durante una run, se riuscita.

## 5. Ambiguità e punti aperti (da decidere o verificare)
1. **Bot e multigiocatore:** per ora tutto locale; l'autorità dello stato (client vs server) si decide quando arriveranno partite online/Firestore.
2. **Finestre di priorità automatiche:** confermi che nel v1 si passano da sole quando non ci sono scelte? (consigliato)
3. **Interrupt e replacement:** SG ne ha poche; predispongo i punti di innesco ma li completo con il primo caso reale.
4. **Regole "trash like cards"** (CR 8.5.6) e costi (CR 1.16): da leggere a fondo quando si implementa l'installazione.
5. **Modello dati:** il motore legge `Card` dall'app (tipo, costo come stringa, forza, ecc.); serve una funzione che trasformi un mazzo salvato (`Deck`) in uno stato di partenza.
6. **Testi con riferimento a "Runner" senza articolo** nelle traduzioni non influenzano il motore (i testi italiani sono solo descrittivi).
7. **Che cosa significa "completa" una carta:** una carta è "finita" quando ha definizione + almeno uno scenario di test verde.

## 6. Piano di lavoro e test

**Test:** Vitest, file `*.spec.ts` accanto al codice del motore (`npm test`). Il motore è deterministico (seme), quindi gli scenari sono scritti con un piccolo linguaggio di prova: preparo uno stato (zone, crediti, clic), applico comandi e controllo stato/eventi. Ogni carta ha uno scenario per ogni suo comportamento non banale.

**Fasi:**
1. **Nucleo senza carte** (nessuna abilità di carta): zone e oggetti, stato, comandi, `legalCommands`, turno/fasi, azioni di base, run senza ICE, breach/accesso con carte generiche, vittoria, flatline. *Tabella dei passi + checkpoint.*
2. **ICE e incontri:** installazione, materializzazione, avvicinamento/incontro/movimento, subroutine che termina l'incursione, rompighiaccio con forza e costi.
3. **Primitive condivise** nell'ordine di frequenza del §3 (crediti, pescare, segnalini, tag, danno…) con le carte che le usano, partendo dalle più semplici (Hedge Fund, Sure Gamble, Government Subsidy, Sprint…).
4. **Meccaniche medie:** abilità condizionali ("quando riscuoti/rubi"), costi con segnalini ospitati, avanzamento, ICE bioroide, virus.
5. **Carte residue di SG** e le due partite complete dei mazzi introduttivi (Runner contro Corp, mosse scritte a mano) come prova d'insieme.
6. Dopo SG: Midnight Sun/Parhelion (mark, charge, sabotage, bypass, regioni, danno core…) e il bot.

Fuori ambito per ora: interfaccia, bot, online, formati con restrizioni, Draft, carte di altri set.
