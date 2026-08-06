import { getWorldCenter } from "./utils.js";

//let global_extra_rerolls = 0; // Seed 3 requires 10 rerolls, even though it seems like there is a valid path much earlier??

// World x range of the corridor the main path starts in.
const PATH_FIND_WORLD_POS_MIN_X = 159;
const PATH_FIND_WORLD_POS_MAX_X = 223;

// Biomes built from the mines template start at a fixed tile instead, wherever
// their region happens to sit.
const MINES_TEMPLATE = 'coalmine.png';
const MINES_START_X = 142;
const MINES_START_LEN = 12;

export function usesMinesTemplate(wangFile) {
    return !!wangFile && wangFile.endsWith(MINES_TEMPLATE);
}

// The connection the path has to start from, or null when the region doesn't
// reach the corridor and the openings in the top row are used instead.
export function getPathStartSegment(bbox, width, height, wangFile, isNGPlus, gameMode = 'normal') {
    if (usesMinesTemplate(wangFile)) return { x: MINES_START_X, len: MINES_START_LEN };

    const segLen = Math.trunc((PATH_FIND_WORLD_POS_MAX_X - PATH_FIND_WORLD_POS_MIN_X) / 10);
    const regionX = (bbox[0] - getWorldCenter(isNGPlus, gameMode)) * 512;
    const startX = Math.trunc((PATH_FIND_WORLD_POS_MIN_X - regionX) / 10);
    if (startX < 0 || startX >= width) return null;
    if (startX + segLen < 0 || startX + segLen >= width) return null;
    if (height < 7) return null;
    return { x: startX, len: Math.trunc(segLen / 10) };
}

function findSequences(pixels, width, rowY, stride) {
    const seqs = [];
    let start = null;
    const rowOffset = rowY * width;

    for (let x = 0; x < width; x++) {
        const idx = (rowOffset + x) * stride;
        const isBlack = (pixels[idx] === 0 && pixels[idx+1] === 0 && pixels[idx+2] === 0);

        if (isBlack) {
            if (start === null) start = x;
        } else {
            if (start !== null) {
                seqs.push([start, x - 1]);
                start = null;
            }
        }
    }
    if (start !== null) seqs.push([start, width - 1]);
    return seqs;
}

export function findMinPath(pixels, width, height, startSegment) {
    const stride = 3;
    let startY = 4;
    let topSequences = [];

    if (startSegment) {
        // Forced start, whether or not that tile ended up open.
        const startX = startSegment.x + Math.trunc(startSegment.len / 2);
        topSequences.push([startX, startX]);
    } else {
        topSequences = findSequences(pixels, width, startY, stride);
    }

    if (topSequences.length === 0) return null;

    //const bottomSequences = findSequences(pixels, width, height - 1, stride);
    //if (bottomSequences.length === 0) return null;

    const directions = [[0, 1], [-1, 0], [1, 0], [0, -1]];

    for (const startSeq of topSequences) {
        const startX = Math.floor((startSeq[0] + startSeq[1]) / 2);
        if (startX < 0 || startX >= width) continue;

        const visited = new Uint8Array(width * height);
        const parents = new Int32Array(width * height).fill(-1);

        const queue = [];
        queue.push({x: startX, y: startY});

        visited[startY * width + startX] = 1;
        parents[startY * width + startX] = -2;

        let found = false;
        let finalNode = null;

        while (queue.length > 0) {
            const curr = queue.shift();

            if (curr.y === height - 1) {
                found = true;
                finalNode = curr;
                break;
            }

            for (const [dx, dy] of directions) {
                const nx = curr.x + dx;
                const ny = curr.y + dy;

                if (nx >= 0 && nx < width && ny > 3 && ny < height) {
                    const nIdx = ny * width + nx;
                    if (visited[nIdx] === 0) {
                        const pIdx = nIdx * stride;
                        const pixelColor = (pixels[pIdx] << 16) | (pixels[pIdx+1] << 8) | pixels[pIdx+2];
                        if ((pixelColor === 0x000000) || (pixelColor === 0xc0ffee) || (pixelColor === 0x8aff80)) {
                            visited[nIdx] = 1;
                            parents[nIdx] = curr.y * width + curr.x;
                            queue.push({x: nx, y: ny});
                        }
                    }
                }
            }
        }

        if (found) {
            const path = [];
            let currIdx = finalNode.y * width + finalNode.x;
            while (currIdx !== -2 && currIdx !== -1) {
                const py = Math.floor(currIdx / width);
                const px = currIdx % width;
                path.push({x: px, y: py});

                const pIdx = parents[currIdx];
                if (pIdx === -2) break;
                currIdx = pIdx;
            }
            return path.reverse();
        }
    }
    return null;
}
