// demo module used by the CLI tests
export function describe(flag, value) {
    if (flag) {
        return 'yes: ' + value;
    }
    const fallback = value ?? 'none';
    if (fallback === 'none') {
        return 'empty';
    }
    return 'no: ' + fallback;
}

export function neverCalled(value) {
    return value * 2;
}
