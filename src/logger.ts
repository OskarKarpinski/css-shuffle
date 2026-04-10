export function debugLog(trace: string, log: string) {
    if (process.env.CSS_SHUFFLE == "debug") {
        console.log(`css-shuffle [${trace}]: ${log}`)
    }
}
