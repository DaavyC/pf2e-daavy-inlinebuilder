// Keeps first item for each derived key.
function uniqueBy(values, keyFn, mapFn = (value) => value) {
    const uniqueValues = [];
    const seen = new Set();

    for (const value of values) {
        const key = keyFn(value);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        uniqueValues.push(mapFn(value));
    }

    return uniqueValues;
}

export {
    uniqueBy
};
