// Every word the sign shows. Chosen to be understood by both English and Italian speakers:
// short English words that are common in Italy or look alike in Italian, plus symbols.

export const strings = {
  today: 'Today',
  now: 'Now',
  comingUp: 'Coming up',
  more: (n: number) => `+${n} more`,
  noEvents: 'No events scheduled',
  connecting: 'Connecting…',
  restarting: 'Restarting…',
  status: {
    free: 'Free',
    occupied: 'Occupied',
    reserved: 'Reserved',
  },
  lastUpdate: 'Last update',
  offline: 'Offline',
} as const;
