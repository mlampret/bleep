import { ChannelInput, ChannelOutput, Filter, SampleGenerator } from './module_units';
import { Module } from './module.js';
import { Patch } from './patch.js';

export class Instrument {
  constructor(modules, patches) {
    this.modules = modules;
    this.patches = patches;
  }
  load(instrDef) {
    var modules = [];
    for (var m of instrDef.modules) {
      var g = null;
      if (m.type == "input") {
        g = new ChannelInput(m.type);
      } else if (m.type == "output") {
        g = new ChannelOutput(m.type);
      } else if (m.type == "low pass filter") {
        g = new Filter(m.type);
      } else if (m.type == "sine" || m.type == "triangle") {
        g = new SampleGenerator(m.type);
      }
      if (g) {
        var mod = new Module(m.x, m.y, g);
        modules.push(mod);
      }
    }
    var patches = [];
    for (var p of instrDef.patches) {
      var patch = new Patch(p.from_module, p.to_module, p.from_input, p.from_output, p.to_input, p.to_output);
      patches.push(patch);
    }
    this.modules = modules;
    this.patches = patches;
  }
  compile() {
    var output = null;
    for (var i = 0; i < this.modules.length; i++) {
      var m = this.modules[i];
      if (m.unit.type == "output") {
        output = i;
      }
    }
    if (!output) {
      return null;
    }

    var queue = [output];
    var seen = {};
    var dependencies = [output];
    while (queue.length > 0) {
      var q = queue[0];
      var queue = queue.splice(1);
      for (var p of this.patches) {
        if (p.to === q && (p.toOutput !== false || t.toOutput !== undefined)) {
          if (!seen[p.from]) {
            dependencies.push(p.from);
            queue.push(p.from);
            seen[p.from] = true;
          }
        }
      }
      seen[q] = true;
    }
    var generators = {};
    for (var i = dependencies.length - 1; i >= 0; i--) {
      var ix = dependencies[i];
      var unit = this.modules[ix].unit;
      var g = null;
      if (unit.type == "input") {
        g = null;
      } else if (unit.type == "triangle" || unit.type == "sine") {
        g = {};
        g[unit.type] = {
          "attack": unit.dials["attack"].value,
          "decay": unit.dials["decay"].value,
          "sustain": unit.dials["sustain"].value,
          "release": unit.dials["release"].value,
        };
        var pitchFound = false;
        for (var p of this.patches) {
          if (p.to === ix && p.toInput === 0) {
            pitchFound = true;
            var pg = generators[p.from];
            if (pg) {
              g[unit.type]["auto_pitch"] = pg;
            }
          }
        }
        if (!pitchFound) {
          g[unit.type]["pitch"] = unit.dials["pitch"].value;
        }
      } else if (unit.type == "low pass filter") {
        g = {};
        g["filter"] = {"lpf": {"cutoff": unit.dials["cutoff"].value}}
        var on = this.compileGenerators(generators, ix, 0);
        Object.keys(on).map((k) => {
          g["filter"][k] = on[k];
        });
      } else if (unit.type == "output") {
        return this.compileGenerators(generators, ix, 0);
      }
      generators[ix] = g;
    }
    return dependencies;
  }

  compileGenerators(generators, ix, input) {
    var gs = [];
    for (var p of this.patches) {
      if (p.to === ix && p.toInput === input) {
        gs.push(generators[p.from])
      } else if (p.from == ix && p.fromInput === input) {
        gs.push(generators[p.to])
      }
    }
    if (gs.length === 0) {
      return null;
    } else if (gs.length === 1) {
      return gs[0];
    } else {
      return {"combined": gs}
    }
  }
}
