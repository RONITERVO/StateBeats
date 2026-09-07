import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { sampleMaps } from '@statebeats/content';
import { mapSchema, commandSchema, compiledProgramSchema } from '@statebeats/sdk';
await mkdir('packages/content/maps', { recursive: true });
await mkdir('schemas', { recursive: true });
for (const map of sampleMaps)
  await writeFile(`packages/content/maps/${map.id}.json`, JSON.stringify(map, null, 2) + '\n');
for (const [name, schema] of Object.entries({
  map: mapSchema,
  command: commandSchema,
  compiled: compiledProgramSchema,
}))
  await writeFile(
    `schemas/${name}.schema.json`,
    JSON.stringify(z.toJSONSchema(schema, { unrepresentable: 'any' }), null, 2) + '\n',
  );
console.log(
  `Exported ${sampleMaps.length} maps and three versioned JSON Schema documents. Runtime validation also checks semantic invariants.`,
);
