/* Namespace: Differ
 *
 * Performs OWL diffs. Native format for resulting diff objects is JSON.
 * Currently includes converted to markdown.
 *
 * Example:
 *  - https://github.com/obophenotype/uberon/blob/master/diffs/uberon-diff.md
 *
 * Scripts:
 *  - owljs-diff
 *
 * Current API may not be stable - use the script rather than the API for now
 *
 *
 * Tests:
 *  - test/differ
 *
 */

var javautil = require("owl/javautil");
var md = require("owl/io/markdown");

importPackage(Packages.org.semanticweb.owlapi.model);


/* Function: Differ
 *
 * Constructor
 *
 * Arguments:
 *  - owl: an <OWL> object
 */
var Differ = exports.Differ = function Differ(owl) {
    this.owl = owl;
    return this;
}

Differ.prototype.getDiffsAsMarkdown = function(owlA, owlB, incClosure, useReasoning) {
    var diffs = this.getDiffs(owlA, owlB, incClosure, useReasoning);
    return this.toMarkdown(owlA, owlB, diffs);
}

function containsJavaObj(arr, obj) {
    return arr.filter(function(x) { return x.equals(obj) }).length > 0;
}

function compareSets(arrA, arrB) {
    var setA = new java.util.HashSet();
    var setB = new java.util.HashSet();
    arrA.forEach( function(x) { setA.add(x) } );
    arrB.forEach( function(x) { setB.add(x) } );

    var lostFromA = [];
    var newInB = [];
    var inBoth = [];

    for (var k in arrA) {
        var obj = arrA[k];
        if (!setB.contains(obj)) {
            lostFromA.push(obj);
        }
    }
    for (var k in arrB) {
        var obj = arrB[k];
        if (!setA.contains(obj)) {
            newInB.push(obj);
        }
        else {
            inBoth.push(obj);
        }
    }
    return {
        lostFromA : lostFromA,
        newInB : newInB,
        inBoth : inBoth
    }
    
}

function ontMetadata(owl) {
    var ont = owl.getOntology();
    var oid = ont.getOntologyID();
    var json =
        {
            iri : oid.getOntologyIRI().toString() + ""
        };
    if (oid.getVersionIRI() != null) {
        json.versionIRI =  oid.getVersionIRI().toString() + ""
    }
    return json
}

Differ.prototype.getDiffs = function(owlA, owlB, incClosure, useReasoning) {
    var diffs =
        {
            originalOntology : ontMetadata(owlA),
            newOntology : ontMetadata(owlB),

            byType : {
                classes : this.getObjListDiffs( 'Class', owlA, owlB, owlA.getClasses(incClosure), owlB.getClasses(incClosure), useReasoning),
                properties : this.getObjListDiffs( 'ObjectProperty', owlA, owlB, owlA.getObjectProperties(incClosure), owlB.getObjectProperties(incClosure), useReasoning)
            }
        };
    return diffs;
}

Differ.prototype.getObjListDiffs = function(objType, owlA, owlB, objsA, objsB, incClosure, useReasoning) {
    console.log("Performing diff for type: "+ objType);
    var diffs = compareSets(objsA, objsB);
    diffs.type = objType;

    diffs.changes = [];

    for (var k in diffs.inBoth) {
        var obj = diffs.inBoth[k];
        var diff = this.getObjDiffs( owlA, owlB, obj, useReasoning);
        if (diff.numberOfChanges > 0) {
            diffs.changes.push(diff);
        }
    }
    return diffs;
}

Differ.prototype.getObjDiffs = function(owlA, owlB, obj, useReasoning) {
    var axiomsA = owlA.getAllAxioms(obj);
    var axiomsB = owlB.getAllAxioms(obj);

    var diffs =  compareSets(axiomsA, axiomsB);
    diffs.obj = obj;

    // TODO
    // OWLAxiom newAxiom = changeAxiomAnnotations(axiom, annotations, factory);

    // TODO - reasoning

    diffs.numberOfChanges = diffs.lostFromA.length + diffs.newInB.length;
    return diffs;
}


Differ.prototype.toMarkdown = function(owlA, owlB, diffs) {
    var ctxt = this;
    var md = "";
    md += h1("Ontology Diff Report");
    md += h2("Original Ontology");
    md += this.ontMetadataToMarkdown(diffs.originalOntology);
    md += h2("New Ontology");
    md += this.ontMetadataToMarkdown(diffs.newOntology);
    for (var k in diffs.byType) {
        md += h1("Report for "+k);
        
        var diff = diffs.byType[k];
        //print(JSON.stringify(diff, null, ' '));

        md += h2(diff.type + " objects lost from source: " + diff.lostFromA.length);
        md += diff.lostFromA.map( function(obj) {
            return li(ctxt.objToMarkdown(owlA, obj));
        }).join("");
        md += h2(diff.type + " objects new in target: " + diff.newInB.length);
        md += diff.newInB.map( function(obj) {
            return h3("New "+diff.type+" : "+ctxt.objToMarkdown(owlB, obj)) + 
                owlB.getAllAxioms(obj).map(
                    function(ax) {
                        return li(ctxt.axiomToMarkdown(owlB, ax));
                    }
                ).join("");
        }).join("");
        md += h2("Changed "+diff.type+" objects: " + diff.changes.length);
        md += diff.changes.map( function(diff) {
            return ctxt.objDiffToMarkdown(owlA, owlB, diff);
        }).join("");
    }
    return md;
}

Differ.prototype.ontMetadataToMarkdown = function(obj) {
    var md = li("IRI: "+obj.iri);
    if (obj.versionIRI != null) {
        md += li("VersionIRI: "+obj.versionIRI);
    }
    return md;
}

Differ.prototype.objToMarkdown = function(owl, obj) {
    return "[" + owl.getLabel(obj)+"]("+obj.getIRI().toString()+")";
}

Differ.prototype.objDiffToMarkdown = function(owlA, owlB, diff) {
    var ctxt = this;
    var md = "";
    md += h3("Changes for: "+this.objToMarkdown(owlB, diff.obj));

    if (diff.lostFromA.length > 0) {
        md += li("_Deleted_");
        md += diff.lostFromA.map( function(obj) {
            return li2(" **-** " + ctxt.axiomToMarkdown(owlA, obj));
        }).sort().join("");
    }

    if (diff.newInB.length > 0) {
        md += li("_Added_");
        md += diff.newInB.map( function(obj) {
            return li2(" **+** " + ctxt.axiomToMarkdown(owlB, obj));
        }).sort().join("");
    }

    return md;
}

Differ.prototype.axiomToMarkdown = function(owl, ax) {
    var jsax = owl.toAxiomaticJSON(ax);
    return md.render(jsax, owl);
}

function li(s) {
    return " * "+s+"\n";
}
function li2(s) {
    return "    * "+s+"\n";
}

function h1(s) {
    return hN(s, "#");
}
function h2(s) {
    return hN(s, "##");
}
function h3(s) {
    return hN(s, "###");
}
function hN(s, pfx) {
    return "\n" + pfx+" "+s+"\n\n";
}