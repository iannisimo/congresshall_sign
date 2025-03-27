import { useEffect, useRef } from "react";

export const requestFullScreen = () => {
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
    } else if ((document.documentElement as any).mozRequestFullScreen) { // Firefox
        (document.documentElement as any).mozRequestFullScreen();
    } else if ((document.documentElement as any).webkitRequestFullscreen) { // Chrome, Safari, and Opera
        (document.documentElement as any).webkitRequestFullscreen();
    } else if ((document.documentElement as any).msRequestFullscreen) { // IE/Edge
        (document.documentElement as any).msRequestFullscreen();
    }
};

export function debounce<F extends Function>(func: F, wait: number): F {
    let timeoutID: number;
  
    if (!Number.isInteger(wait)) {
      console.warn("Called debounce without a valid number");
      wait = 300;
    }
  
    // conversion through any necessary as it wont satisfy criteria otherwise
    return <any>function (this: any, ...args: any[]) {
      clearTimeout(timeoutID);
      const context = this;
  
      timeoutID = window.setTimeout(function () {
        func.apply(context, args);
      }, wait);
    };
  }

export const pDate = (date?: Date) => (date?.toLocaleDateString('it-IT', {day: "numeric", month: "long", year: "numeric"}) ?? "");
export const pTime = (date?: Date) => ((date?.toLocaleTimeString('en-GB', {hour12: true, hour: "2-digit", minute: '2-digit', hourCycle: "h12"}) ?? "--:-- --").toUpperCase());

 
export function useInterval(callback: Function, delay: number) {
  const savedCallback = useRef<Function>(() => {});
 
  // Remember the latest callback.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);
 
  // Set up the interval.
  useEffect(() => {
    function tick() {
      savedCallback.current();
    }
    if (delay !== null) {
      let id = setInterval(tick, delay);
      return () => clearInterval(id);
    }
  }, [delay]);
}

export const GoogleSearch = (term: string) => {
  const _term = term.toLowerCase().replace(/ /g, '+');
  return 'https://www.google.com/search?as_st=y&hl=en&as_q=logo+' + _term + '&as_epq=&as_oq=&as_eq=&imgar=s&imgc=trans&imgcolor=&imgtype=&cr=&as_sitesearch=&as_filetype=&tbs=&udm=2'
}
