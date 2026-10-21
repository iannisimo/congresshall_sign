import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from './ui.tsx';

// Help for the `admin` account only: events, organizers, room status and prints.

function Steps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5">{children}</ol>;
}

function Topic({ title, summary, children, open = false }: { title: string; summary: string; children: ReactNode; open?: boolean }) {
  return (
    <Card>
      <details open={open} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-4 sm:px-5">
          <span className="flex-1">
            <span className="block font-semibold text-slate-900">{title}</span>
            <span className="block text-sm text-slate-500">{summary}</span>
          </span>
          <ChevronDown className="size-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-3 border-t border-slate-100 p-4 text-sm leading-relaxed text-slate-700 sm:px-5">{children}</div>
      </details>
    </Card>
  );
}

export default function Help() {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900">Guida</h1>
        <p className="text-sm text-slate-500">Le operazioni di tutti i giorni, passo per passo.</p>
      </div>

      <Topic title="Inserire un nuovo evento" summary="Un congresso, una riunione, anche su più giorni." open>
        <Steps>
          <li>
            In <b>Programma</b> premi il <b>+</b> accanto al giorno giusto, oppure apri <b>Eventi</b> e scegli il nuovo evento.
          </li>
          <li>
            Scegli l’<b>organizzatore</b> (se non c’è, scrivi il nome e premi «Aggiungi») e il <b>logo</b>. Scrivi il <b>titolo</b>; il sottotitolo è facoltativo.
          </li>
          <li>
            In <b>Date e sale</b> imposta <b>Dal</b> e <b>Al</b>. Nei campi data, <kbd>o</kbd> inserisce oggi e <kbd>d</kbd> domani.
          </li>
          <li>
            Per ogni giorno aggiungi le <b>occupazioni</b>: sale, orario di inizio e fine, eventuali pause (Break, Coffee break, Lunch break). Un giorno può averne
            più d’una, in sale e orari diversi, oppure nessuna (una gita).
          </li>
          <li>
            Controlla l’anteprima a destra: è quello che si vedrà sul cartello. Poi premi <b>Salva</b>.
          </li>
        </Steps>
        <p>
          <b>Pause fuori orario:</b> una pausa può cadere anche prima dell’inizio o dopo la fine dell’occupazione (colazione, cena). Compare l’avviso «Solo
          nelle stampe»: non appare sul cartello, ma è nella stampa ristorante e negli altri fogli.
        </p>
        <p>
          <b>Preparazione e pulizia:</b> di norma le sale restano riservate dalle 14:00 del giorno prima fino alle 14:00 dopo la fine. Puoi scegliere «nessuna
          preparazione» o orari personalizzati.
        </p>
        <p>
          Se un giorno è uguale al precedente usa la copia dal giorno prima (o a tutti i giorni seguenti) invece di riscrivere tutto.
        </p>
      </Topic>

      <Topic title="Modificare, spostare o eliminare un evento" summary="Cambiare orari, sale, date; togliere un evento.">
        <Steps>
          <li>
            Trova l’evento in <b>Programma</b> (per settimana), in <b>Calendario</b> (per mese) o in <b>Eventi</b> (elenco, con filtro per organizzatore, titolo o
            numero di prenotazione).
          </li>
          <li>
            Premi la matita (<b>Modifica</b>) e cambia quello che serve. L’evento resta lo stesso: non se ne crea uno nuovo.
          </li>
          <li>
            Cambiando <b>Dal</b> si sposta tutto l’evento; cambiando <b>Al</b> si aggiungono giorni (copie dell’ultimo) o si tolgono dalla fine.
          </li>
          <li>
            Per eliminarlo usa il cestino; ti viene chiesta conferma. Gli eventi finiti si trovano in <b>Eventi passati</b>.
          </li>
        </Steps>
        <p>Dal Programma l’editor si apre direttamente sul giorno da cui sei partito.</p>
      </Topic>

      <Topic title="Duplicare un evento" summary="Per un evento che si ripete o che somiglia a uno già fatto.">
        <Steps>
          <li>
            Premi <b>Duplica</b> sull’evento (in Programma o in Eventi).
          </li>
          <li>
            Si apre la sezione <b>Date e sale</b>, evidenziata: scegli la nuova data di inizio. Tutti i giorni si spostano insieme.
          </li>
          <li>
            Il numero di prenotazione parte vuoto; controlla il resto e premi <b>Salva</b>.
          </li>
        </Steps>
      </Topic>

      <Topic title="Bozze: nascondere un evento dal cartello" summary="Un evento non ancora confermato.">
        <p>
          Nell’editor togli la spunta da <b>Visibile sul cartello</b>: l’evento diventa una <b>Bozza</b>. Non appare sul cartello e non occupa le sale, ma resta
          in elenco e nelle stampe, dove è segnato «DA CONFERMARE».
        </p>
        <p>Quando è confermato rimetti la spunta e salva. Dal Programma puoi anche usare l’icona a occhio per nascondere o mostrare un evento al volo.</p>
      </Topic>

      <Topic title="Bassa priorità: eventi da non mostrare su /big" summary="Per eventi minori che non devono occupare il cartello grande.">
        <p>
          Nell’editor spunta <b>Bassa priorità</b>. L’evento continua ad apparire sui cartelli normali, ma il cartello <b>/big</b> lo ignora del tutto, anche
          mentre è in corso: se è l’unico evento di oggi, /big mostra il carosello come se non ci fosse niente.
        </p>
        <p>Lo stato delle sale non cambia: la barra delle sale in fondo mostra sempre la situazione reale.</p>
      </Topic>

      <Topic title="Sovrapposizioni di sale" summary="Quando due eventi sono nella stessa sala alla stessa ora.">
        <p>
          Se due occupazioni di eventi diversi si sovrappongono nella stessa sala, nell’editor compare un riquadro giallo <b>Sovrapposizioni</b> con il giorno
          interessato (cliccalo per andarci). Un punto arancione sul giorno indica che c’è qualcosa da controllare.
        </p>
        <p>Puoi salvare comunque, dopo conferma. Preparazione e pulizia che si sovrappongono sono normali e non generano avvisi.</p>
      </Topic>

      <Topic title="Cambiare lo stato di una sala a mano" summary="Segnare libera, occupata o riservata una sala subito.">
        <Steps>
          <li>
            In <b>Programma</b>, nel riquadro <b>Sale adesso</b>, premi <b>Cambia</b> sulla sala.
          </li>
          <li>
            Scegli lo stato. Se vuoi, scrivi un testo per il cartello (brevi parole comprensibili a tutti); altrimenti mostra quello standard.
          </li>
          <li>
            Scegli <b>Fino a quando</b>: al prossimo cambio previsto dal programma, fino a un’ora precisa, oppure finché non lo ripristini.
          </li>
        </Steps>
        <p>
          Per tornare a seguire il programma premi <b>Ripristina</b> sulla sala.
        </p>
      </Topic>

      <Topic title="Stampare" summary="Foglio del giorno, ristorante, dettagli degli eventi.">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <b>Foglio del giorno:</b> in Programma, il pulsante <b>Stampa</b> accanto al giorno.
          </li>
          <li>
            <b>Stampa ristorante (14 gg):</b> in <b>Eventi</b>. I prossimi 14 giorni, con orari e pause ma senza sale; le bozze sono segnate «DA CONFERMARE». Ignora i
            filtri dell’elenco.
          </li>
          <li>
            <b>Stampa dettagli:</b> un evento per pagina, con note e orari. Dall’elenco stampa gli eventi mostrati (dopo i filtri) o, con il pulsante della riga,
            solo quello; nell’editor <b>Stampa</b> stampa l’evento salvato.
          </li>
        </ul>
      </Topic>

      <Topic title="Note interne, costo e numero di prenotazione" summary="Informazioni per lo staff che non appaiono mai sul cartello.">
        <p>
          Nell’editor trovi le note per la <b>Reception</b> (per tutto l’evento o per il singolo giorno), per <b>Housekeeping e preparazione sala</b> e per il{' '}
          <b>Ristorante</b>, oltre a <b>Costo</b> (in euro, es. <code>1.234,50</code>) e <b>Numero prenotazione</b>, che si può cercare in Eventi.
        </p>
        <p>
          Dal secondo giorno, una nota vuota significa «come il giorno prima» e le stampe mostrano il testo ereditato. Per dire «niente oggi» scrivi <code>—</code>.
        </p>
      </Topic>

      <Topic title="Organizzatori e loghi" summary="Aggiungere un organizzatore, caricare o scegliere un logo.">
        <Steps>
          <li>
            Apri <b>Organizzatori</b>: da qui puoi aggiungerne, rinominarli e gestire i loro loghi.
          </li>
          <li>
            Per caricare un logo trascina il file, scegli un file o incolla un’immagine. Prima di salvare puoi ritagliare il quadrato da tenere (trascina e usa lo zoom).
          </li>
          <li>
            Senza un logo proprio, scegli uno degli emblemi generici (università, medicina, tecnologia, associazioni…).
          </li>
        </Steps>
        <p>Quando scegli un organizzatore in un evento, il suo primo logo viene selezionato da solo. Per rinominare un organizzatore o eliminare un logo usa i pulsanti nella sua scheda. Attenzione: «Elimina organizzatore ed eventi» cancella anche tutti i suoi eventi, e non si può annullare.</p>
      </Topic>
    </div>
  );
}
