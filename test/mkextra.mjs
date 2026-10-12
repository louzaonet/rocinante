// Casos de test/cases que no salen de gen.py (DRC): la base de datos la
// escribe Rocinante a partir de la plantilla, y la referencia, el intérprete
// real. Para regenerarlos:
//   node test/mkextra.mjs
//   for c in ramload whato2; do python3 tools/zxdaad.py test/cases/$c.ddb test/cases/$c.cmd | head -c -1 > test/ref/$c.txt; done
//   node test/mksnap.mjs && node test/export128.mjs && python3 test/screens.py ramload whato2
// Casos:
//   ramload  RAMLOAD sin un RAMSAVE antes abandona la entrada
//   whato2   WHATO encuentra el objeto en cualquier sitio si no está llevado,
//            puesto ni presente (el de menor número, aunque no esté creado)
import fs from 'fs';
import { newProject } from '../src/project/template.js';
import { compileProject } from '../src/project/compile.js';
import { writeDDB } from '../src/daad/ddb-write.js';

const obj = (id, text, noun, loc, extra = {}) => ({ id, text, noun, adj: '_', loc, weight: 1, container: false, wearable: false, attrs: 0, ...extra });
const write = (name, p, cmds) => {
  const { model, errors } = compileProject(p);
  if (errors.length) throw new Error(name + ': ' + errors[0].msg);
  fs.writeFileSync(`test/cases/${name}.ddb`, writeDDB(model));
  fs.writeFileSync(`test/cases/${name}.cmd`, cmds.join('\n') + '\n');
};

{
  const p = newProject('Prueba', 'es');
  p.vocab.push({ word: 'PROBAR', type: 'verb', value: 60 }, { word: 'MEMORI', type: 'verb', value: 61 });
  p.messages.push({ id: 'cargado', text: 'RAMLOAD ha seguido.' }, { id: 'guardado', text: 'guardado en memoria.' });
  const r = p.processes.find((x) => x.id === 'respuestas');
  r.source = '> PROBAR _\n    RAMLOAD 255\n    MESSAGE cargado\n    DONE\n> MEMORI _\n    RAMSAVE\n    MESSAGE guardado\n    DONE\n' + r.source;
  write('ramload', p, ['probar', 'memori', 'probar', 'n']);
}
{
  const p = newProject('Prueba', 'es');
  p.vocab.push({ word: 'PROBAR', type: 'verb', value: 60 }, { word: 'LIBRO', type: 'noun', value: 101 }, { word: 'SACO', type: 'noun', value: 102 },
    { word: 'MONED', type: 'noun', value: 103 }, { word: 'LLAVE', type: 'noun', value: 104 });
  // un libro en el pasillo, un saco (contenedor) aquí con una moneda dentro, y
  // dos llaves: una sin crear y otra en el pasillo
  p.objects.push(obj('libro', 'Un libro', 'LIBRO', 'pasillo'), obj('saco', 'Un saco', 'SACO', 'entrada', { container: true }));
  p.objects.push(obj('moneda', 'Una moneda', 'MONED', '' + (p.objects.length - 1)));
  p.objects.push(obj('llave', 'Una llave', 'LLAVE', 'NOTCREATED'), obj('llave2', 'Otra llave', 'LLAVE', 'pasillo'));
  const r = p.processes.find((x) => x.id === 'respuestas');
  r.source = '> PROBAR _\n    WHATO\n    PRINT fRefObject\n    SPACE\n    PRINT fRefObjLoc\n    NEWLINE\n    DONE\n' + r.source;
  write('whato2', p, ['probar libro', 'probar saco', 'probar moneda', 'probar linterna', 'probar llave', 'n', 'probar libro', 'probar moneda', 'probar llave']);
}
