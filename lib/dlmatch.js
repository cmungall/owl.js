/* Namespace: DLMatch
 *
 * Matches Description Logic axioms and expressions
 *
 * Tests:
 *  - test/dlmatch
 *
 */

var javautil = require("owl/javautil");
importPackage(Packages.org.semanticweb.owlapi.model);

/* Function: DLMatch
 *
 * Constructor
 *
 * Arguments:
 *  - owl: an <OWL> object
 */
var DLMatch = exports.DLMatch = function DLMatch(owl) {
    this.owl = owl;
    return this;
}

/* Function: find
 *
 * Finds axioms in the ontology that match the query template
 *
 * Arguments:
 *  - q: a query template
 *
 * Returns:
 *  a list of bindings
 */
DLMatch.prototype.find = function(q) {
    var owl = this.owl;
    var axioms = owl.getAllAxioms();
    var matches = [];
    for (var k in axioms) {
        var axiom = axioms[k];
        var m = this.match(axiom, q);
        if (m != null) {
            m.axiom = axiom;
            matches.push(m);
        }
    }
    return matches;
}

/* Function: findAndReplace
 *
 * Finds and replaces axioms in the ontology that match the query template
 *
 * Arguments:
 *  - q: a query template
 *  - rfunc: a function that generates an axiom or list of axioms from the bindings
 *
 * Returns:
 *  <owlapi.OWLAxiom> []
 */
DLMatch.prototype.findAndReplace = function(q, rfunc) {
    var owl = this.owl;
    var axioms = owl.getAllAxioms();
    var newAxioms = [];
    var rmAxioms = [];
    for (var k in axioms) {
        var axiom = axioms[k];
        var m = this.match(axiom, q);
        if (m != null) {
            m.axiom = axiom;
            var replacementAxioms = rfunc.call(this, m, owl);
            if (replacementAxioms == null) {
            }
            else if (replacementAxioms.concat != null) {
                //this.log(ax + " ===> " + replacementAxioms);
                newAxioms = newAxioms.concat(replacementAxioms);
                rmAxioms.push(axiom);
            }
            else {
                //this.log(ax + " ===> " + replacementAxioms);
                newAxioms.push(replacementAxioms);
                rmAxioms.push(axiom);
            }
        }
    }
    owl.addAxioms(newAxioms);
    owl.removeAxioms(rmAxioms);
    return newAxioms;
}


/* Function: matches
 *
 * Attempts to match the specified axiom or expression with the query template
 *
 * Arguments:
 *  - x: object to match
 *  - q: a query template
 *
 * Returns:
 *  A binding object, or null if no match
 */
DLMatch.prototype.match = function(x, q) {
    if (q.push != null) {
        return this.matchSet(x, q);
    }
    if (this.isVariable(q)) {
        return this.matchVariable(x, q);
    }
    if (q instanceof OWLObject) {
        return this.matchObject(x, q);
    }
    return this.matchKeys(x, q);
}

DLMatch.prototype.isVariable = function(q) {
    var qv = this.getVariable(q);
    if (qv != null) {
        return true;
    }
    return false;
}

// a variable can either be (1) a string "?var" or (2) a dict with a var key
DLMatch.prototype.getVariable = function(q) {
    if (typeof q == 'string') {
        if (q.slice(0,1) == '?') {
            return {
                var : q.slice(1)
            };
        }
    }
    if (q.var != null) {
        return q;
    }
    return null;
}

DLMatch.prototype.matchVariable = function(x, q) {
    var qv = this.getVariable(q);
    var b = {};
    b[qv.var] = x;
    return b;
}

DLMatch.prototype.matchObject = function(x, q) {
    if (x.equals(q)) {
        return {};
    }
    else {
        return null;
    }
}

DLMatch.prototype.matchKeys = function(x, q) {
    // query is a dict indexing the arguments of the axiom or expression.
    var isMatch = true;
    var bindings = {};
    for (var k in q) {
        // TODO - order for optimization
        var subq = q[k];

        if (k == 'a') {
            if (x instanceof subq) {
                continue;
            }
            else {
                return null;
            }
        }

        var subBindings = null;

        // duck-typing
        var methodName = this.getMethodName(k);
        var methodObj = x[methodName];
        if (methodObj != null) {            
            var subx = methodObj.apply(x);
            if (subx instanceof java.util.Collection) {
                subx = javautil.collectionToJsArray(subx);
            }
            subBindings = this.match(subx, subq);
        }
        if (subBindings == null) {
            isMatch = false;
            bindings = null;
            break;
        }
        else { 
            bindings = this.mergeBindings(bindings, subBindings);
        }
    }
    return bindings;
}

// every element of q must match some element of x
// Note: this is deterministic, so [ "?x", "?y" ]
// will match greedily; no backtracking
DLMatch.prototype.matchSet = function(x, q) {
    var candidateIndex = [];    

    this.log("QSET: "+q);

    // create match matrix
    for (var qi=0; qi<q.length; qi++) {
        var subq = q[qi];
        if (subq == '...') {
            // TODO
            break;
        }
        this.log(" QI: "+qi+" "+subq);
        var xcandidateIndex = [];
        var submatches = [];
        var hasMatch = false;
        for (var xi=0; xi<x.length; xi++) {
            var subx = x[xi];
            var b = this.match(subx, subq);            
            xcandidateIndex[xi] = b;
            if (b != null) {
                submatches.push( { binding: b, pos: xi } );
                hasMatch = true; // at least one
                this.log("   M: "+xi+" "+b);
            }
        }
        if (!hasMatch) {
            //this.log("Could not match "+subq+" in "+q);
            // everything in query must be matched
            return null;
        }
        candidateIndex[qi] = submatches;
    }

    var matches = this.matrixMatch(candidateIndex, 0, []);
    if (matches == null) {
        return null;
    }
    else {
        var bindings = {};
        this.log("SUCCESS: "+matches.length);
        for (var k in matches) {
            this.log(bindings + " ==> "+matches[k]);
            bindings = this.mergeBindings(bindings, matches[k]);
        }
        return bindings;
    }
}

// returns list of bindings
DLMatch.prototype.matrixMatch = function(rows, rowNum, selected) {
    if (rowNum >= rows.length) {
        return [];
    }
    var row = rows[rowNum];
    for (var k in row) {
        var cm = row[k];
        if (selected.indexOf(cm.pos) > -1) {
            continue;
        }
        var result = this.matrixMatch(rows, rowNum+1, selected.concat([cm.pos]));
        if (result != null) {
            return result.concat(cm.binding);
        }
    }
    return null;
}

DLMatch.prototype.mergeBindings = function(h1, h2) {
    var h = {};
    for (var k in h1) {
        h[k] = h1[k];
    }
    for (var k in h2) {
        if (h[k] != null) {
            console.warn("DUPE");
            return {};
        }
        h[k] = h2[k];
    }
    return h;
}

// e.g. property ==> getProperty
DLMatch.prototype.getMethodName = function(k) {
    return "get" + k.slice(0,1).toUpperCase() + k.slice(1);
}


DLMatch.prototype.log = function(msg) {
    //console.log(msg);
}


/*

{ 
 a: OWLObjectSomeValuesFrom,
 property: o.part_of,
 filler: "?Whole",
}

{ 
 a: OWLObjectSomeValuesFrom,
 property: o.part_of,
 filler: {
   var: "Whole",
   condition: function(x,owl) { return owl.isSubClassOf(x,...) }
 },
}

*/