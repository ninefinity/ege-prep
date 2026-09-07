import { E } from "./runtime.js";

/* Survey charts for task 38. The exam hands students a table or a pie of one
   survey, and the drills ask magnitude questions about it ("roughly double",
   "a gap of 28 percentage points"), so the default form is a ranked horizontal
   bar -- one series, one hue, values labelled on every bar. `kind: "pie"` is
   there for prompts whose wording says "see the pie chart below".

   Colours come from CSS variables so both modes work; the pie's five hues are
   a validated categorical set, and every slice carries a direct label, which
   is what lets the lighter hues sit on a light surface. */

var SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(name, attrs) {
  var node = document.createElementNS(SVG_NS, name);
  Object.keys(attrs || {}).forEach(function (key) {
    node.setAttribute(key, String(attrs[key]));
  });
  return node;
}

function svgText(text, attrs) {
  var node = svgEl("text", attrs);
  node.textContent = text;
  return node;
}

E.CHART_SERIES_SLOTS = 5;

E.chartSeriesVar = function chartSeriesVar(index) {
  return "var(--ege-series-" + ((index % E.CHART_SERIES_SLOTS) + 1) + ")";
};

/* The ramp runs dark-to-light, so a row's step comes from its rank by share,
   not its position in the data. */
E.chartRankIndex = function chartRankIndex(rows) {
  var order = rows
    .map(function (row, index) {
      return { index: index, value: Number(row.value) };
    })
    .sort(function (a, b) {
      return b.value - a.value;
    });
  var rank = {};
  order.forEach(function (entry, position) {
    rank[entry.index] = position;
  });
  return rank;
};


E.chartRows = function chartRows(spec) {
  return ((spec && spec.data) || []).filter(function (row) {
    return row && row.label != null && isFinite(Number(row.value));
  });
};

/* The values are already percentages of one survey, so the axis runs to the
   next multiple of ten rather than to the largest bar. */
E.chartAxisMax = function chartAxisMax(rows) {
  var max = rows.reduce(function (acc, row) {
    return Math.max(acc, Number(row.value));
  }, 0);
  return Math.max(10, Math.ceil(max / 10) * 10);
};

E.buildChartTable = function buildChartTable(spec, rows) {
  var table = document.createElement("table");
  table.className = "ege-chart__table";
  var caption = document.createElement("caption");
  caption.textContent = spec.title || "Survey data";
  table.appendChild(caption);
  var head = document.createElement("tr");
  ["Option", "Share"].forEach(function (label) {
    var th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    head.appendChild(th);
  });
  table.appendChild(head);
  rows.forEach(function (row) {
    var tr = document.createElement("tr");
    var th = document.createElement("th");
    th.scope = "row";
    th.textContent = row.label;
    var td = document.createElement("td");
    td.textContent = row.value + (spec.unit || "%");
    tr.appendChild(th);
    tr.appendChild(td);
    table.appendChild(tr);
  });
  return table;
};

/* Labels sit above their bar rather than in a left column: these drills live
   in the narrow read pane, and a label column there either truncates the
   longer options or squeezes the bars to nothing. */
E.buildBarChart = function buildBarChart(spec, rows) {
  var unit = spec.unit || "%";
  var width = 520;
  var padX = 4;
  var labelH = 24;
  var barH = 26;
  var rowGap = 28;
  var rowH = labelH + barH + rowGap;
  var topPad = 30;
  var height = topPad + rows.length * rowH;
  var valueW = 52;
  var plotW = width - padX * 2 - valueW;
  var axisMax = E.chartAxisMax(rows);

  var svg = svgEl("svg", {
    viewBox: "0 0 " + width + " " + height,
    class: "ege-chart__svg",
    role: "img",
    "aria-label": spec.title || "Survey results",
  });

  for (var tick = 10; tick <= axisMax; tick += 10) {
    var tx = padX + (tick / axisMax) * plotW;
    svg.appendChild(
      svgEl("line", { x1: tx, y1: topPad - 8, x2: tx, y2: height - 14, class: "ege-chart__grid" })
    );
    svg.appendChild(svgText(tick + unit, { x: tx, y: topPad - 14, class: "ege-chart__tick" }));
  }

  rows.forEach(function (row, index) {
    var top = topPad + index * rowH;
    var value = Number(row.value);
    var w = Math.max(3, (value / axisMax) * plotW);

    svg.appendChild(
      svgText(row.label, { x: padX, y: top + 17, class: "ege-chart__row-label" })
    );
    svg.appendChild(
      svgEl("rect", {
        x: padX, y: top + labelH, width: w, height: barH, rx: 4,
        class: "ege-chart__bar",
      })
    );
    svg.appendChild(
      svgText(value + unit, {
        x: padX + w + 10, y: top + labelH + barH - 6, class: "ege-chart__value",
      })
    );
  });

  return svg;
};

/* Callout boxes are pushed apart until none overlap, then clamped inside the
   figure -- without it the small slices stack their labels on top of each
   other. Ported from the source trainer's solver. */
E.relaxChartCallouts = function relaxChartCallouts(items, minY, maxY, pad) {
  if (items.length <= 1) return;
  pad = pad == null ? 14 : pad;

  for (var iter = 0; iter < 35; iter += 1) {
    var moved = false;
    for (var i = 0; i < items.length - 1; i += 1) {
      var need = items[i].boxH / 2 + items[i + 1].boxH / 2 + pad;
      var gap = items[i + 1].y - items[i].y;
      if (gap < need) {
        moved = true;
        var push = (need - gap) / 2;
        items[i].y -= push;
        items[i + 1].y += push;
      }
    }

    items[0].y = Math.max(items[0].y, minY + items[0].boxH / 2);
    for (var f = 1; f < items.length; f += 1) {
      var lo = items[f - 1].y + items[f - 1].boxH / 2 + items[f].boxH / 2 + pad;
      if (items[f].y < lo) items[f].y = lo;
    }

    var last = items.length - 1;
    items[last].y = Math.min(items[last].y, maxY - items[last].boxH / 2);
    for (var b = last - 1; b >= 0; b -= 1) {
      var hi = items[b + 1].y - items[b + 1].boxH / 2 - items[b].boxH / 2 - pad;
      if (items[b].y > hi) items[b].y = hi;
    }

    if (!moved) break;
  }
};

function wrapLabel(text, perLine) {
  var words = String(text).split(/\s+/);
  var lines = [];
  var line = "";
  words.forEach(function (word) {
    var next = line ? line + " " + word : word;
    if (next.length > perLine && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines;
}

E.buildPieChart = function buildPieChart(spec, rows) {
  var unit = spec.unit || "%";
  var width = 560;
  var height = 430;
  var cx = 280;
  var cy = 215;
  var radius = 96;
  var lineH = 19;

  var total = rows.reduce(function (acc, row) {
    return acc + Number(row.value);
  }, 0) || 1;

  var svg = svgEl("svg", {
    viewBox: "0 0 " + width + " " + height,
    class: "ege-chart__svg",
    role: "img",
    "aria-label": spec.title || "Survey results",
  });

  var rank = E.chartRankIndex(rows);

  var angle = -90;
  var items = rows.map(function (row, index) {
    var sweep = (Number(row.value) / total) * 360;
    var start = angle;
    var end = angle + sweep;
    var mid = start + sweep / 2;
    angle = end;
    var rad = (mid * Math.PI) / 180;
    var lines = wrapLabel(row.label, 18);
    return {
      row: row,
      index: index,
      start: start,
      end: end,
      cos: Math.cos(rad),
      sin: Math.sin(rad),
      lines: lines,
      boxH: lines.length === 1 ? 44 : 26 + lines.length * lineH,
      y: cy + (radius + 52) * Math.sin(rad),
    };
  });

  var groups = items.map(function (item) {
    var group = svgEl("g", { class: "ege-chart__group", tabindex: "0", role: "listitem" });
    group.appendChild(
      svgEl("title", {})
    ).textContent = item.row.label + ": " + item.row.value + unit;
    svg.appendChild(group);
    return group;
  });

  items.forEach(function (item) {
    var rad = function (deg) {
      return (deg * Math.PI) / 180;
    };
    var x1 = cx + radius * Math.cos(rad(item.start));
    var y1 = cy + radius * Math.sin(rad(item.start));
    var x2 = cx + radius * Math.cos(rad(item.end));
    var y2 = cy + radius * Math.sin(rad(item.end));
    var large = item.end - item.start > 180 ? 1 : 0;
    groups[item.index].appendChild(
      svgEl("path", {
        d: "M " + cx + " " + cy + " L " + x1 + " " + y1 + " A " + radius + " " +
           radius + " 0 " + large + " 1 " + x2 + " " + y2 + " Z",
        fill: E.chartSeriesVar(rank[item.index]),
        class: "ege-chart__slice",
      })
    );
  });

  var right = items.filter(function (i) { return i.cos >= 0; })
    .sort(function (a, b) { return a.y - b.y; });
  var left = items.filter(function (i) { return i.cos < 0; })
    .sort(function (a, b) { return a.y - b.y; });
  E.relaxChartCallouts(right, 28, height - 28, 12);
  E.relaxChartCallouts(left, 28, height - 28, 12);

  items.forEach(function (item) {
    var isRight = item.cos >= 0;
    var sx = cx + radius * 0.98 * item.cos;
    var sy = cy + radius * 0.98 * item.sin;
    var elbowX = cx + (radius + 24) * item.cos;
    // Callout text is anchored outside endX, so this has to leave room for the
    // longest wrapped line -- pushed further out, it spills past the viewBox
    // and .ege-read-scroll clips it.
    var endX = isRight ? cx + 116 : cx - 116;

    groups[item.index].appendChild(
      svgEl("polyline", {
        points: sx + "," + sy + " " + elbowX + "," + item.y + " " + endX + "," + item.y,
        class: "ege-chart__leader",
      })
    );

    var textX = isRight ? endX + 10 : endX - 10;
    var anchor = isRight ? "start" : "end";
    var startY = item.y - ((item.lines.length - 1) * lineH) / 2;

    item.lines.forEach(function (line, i) {
      groups[item.index].appendChild(
        svgText(line, {
          x: textX, y: startY + i * lineH + 4,
          "text-anchor": anchor, class: "ege-chart__callout-label",
        })
      );
    });
    groups[item.index].appendChild(
      svgText(item.row.value + unit, {
        x: textX, y: startY + item.lines.length * lineH + 6,
        "text-anchor": anchor, class: "ege-chart__callout-value",
      })
    );
  });

  return svg;
};

E.buildSurveyChart = function buildSurveyChart(spec) {
  var rows = E.chartRows(spec);
  if (!rows.length) return null;

  var figure = document.createElement("figure");
  figure.className = "ege-chart ege-chart--" + (spec.kind === "pie" ? "pie" : "bar");

  if (spec.title) {
    var caption = document.createElement("figcaption");
    caption.className = "ege-chart__title";
    caption.textContent = spec.title;
    figure.appendChild(caption);
  }

  figure.appendChild(
    spec.kind === "pie" ? E.buildPieChart(spec, rows) : E.buildBarChart(spec, rows)
  );
  // The same numbers as a table, for screen readers and for copying out.
  figure.appendChild(E.buildChartTable(spec, rows));
  return figure;
};
