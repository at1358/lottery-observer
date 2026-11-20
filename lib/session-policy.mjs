// App sessions use the same revocable server-side session table as browser sessions.
// The agent only selects a lifetime; it never grants identity or permissions.
export function sessionLifetime(agent='') {
 return /(?:^|\s)PeriodObserverAndroid\/\d+\.\d+\.\d+(?:\s|$)/.test(agent)?90*86400:12*3600;
}
