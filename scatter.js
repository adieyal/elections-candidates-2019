var margin = {top: 19.5, right: 19.5, bottom: 65.5, left: 70},
    width = 960 - margin.right,
    height = 500 - margin.top - margin.bottom;
var minAge = 30, maxAge = 60;

var xScale = d3.scale.linear().domain([minAge, maxAge]).range([0, width]).nice(),
    yScale = d3.scale.linear().domain([1, 0]).range([0, height]).nice(),
    colorScale = d3.scale.category10(),
    radiusScale = d3.scale.linear().domain([0, 1000]).range([0, 40]),
    xAxis = d3.svg.axis().orient("bottom").scale(xScale).ticks(12, d3.format(",d")),
    yAxis = d3.svg.axis().scale(yScale).orient("left");

var svg = d3.select("#chart").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

svg.append("g")
    .attr("class", "x axis")
    .attr("transform", "translate(0," + height + ")")
    .call(xAxis);

// Add the y-axis.
svg.append("g")
    .attr("class", "y axis")
    .call(yAxis);

var approximate_age = function(current_year, birth_year) {
    if (birth_year < 1919)
        birth_year += 100;
    return current_year - birth_year;
}

function toTitleCase(str) {
        return str.replace(
            /\w\S*/g,
            function(txt) {
                return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
            }
        );
    }

d3.csv("all.csv", function(data) {
    var today = new Date(); 
    var data_by_party = {}
    
    data.map(function(el) {
        el["gender"] = el["IDNumber"][6] < 5 ? "female" : "male";
        var id_year = parseInt(el["IDNumber"].substr(0, 2)) + 1900;
        el["age"] = approximate_age(today.getFullYear(), id_year)
        party = toTitleCase(el["Party name"]);
        if (!(party in data_by_party))
            data_by_party[party] = {"male" : 0, "female" : 0, "ages" : []}
        data_by_party[party][el["gender"]] += 1;
        data_by_party[party]["ages"].push(el["age"]);
    })

    var parties = []
    for (key in data_by_party) {
        el = data_by_party[key];
        el["medianAge"] = d3.median(el["ages"])
        el["total"] = el["male"] + el["female"]
        el["femaleRatio"] = el["female"] / el["total"]
        el["party"] = key;
        parties.push(el);
    }

    var position = function(dot) {
        dot
          .attr("cx", function(d) { return xScale(d.medianAge); })
          .attr("cy", function(d) { return yScale(d.femaleRatio); })
          .attr("r", function(d) { return radiusScale(d.total); });
    }

    svg.selectAll("circle").data(parties).enter()
        .append("circle")
            .classed("dot", true)
            .style("fill", function(d) {
                return colorScale(d.party)
            })
            .call(position)
            .on("mousemove", function() {
                var el = this.__data__;
                var tooltip = d3.select("#tooltip")
                    .style("top", (d3.event.pageY + 16) + "px")
                    .style("left", (d3.event.pageX + 16) + "px")
                    .style("display", "block")
                tooltip.select(".party-name").text(el.party)
                tooltip.select(".candidates").text("Total candidates: " + el.total)
                tooltip.select(".men").text("Men: " + el.male)
                tooltip.select(".women").text("Women: " + el.female)
            })
            .on("mouseout", function() {
                d3.select("#tooltip").style("display", "none")
            })
    svg.append("line")
        .classed("gender-equality", true)
        .attr("x1", xScale(minAge))
        .attr("x2", xScale(maxAge))
        .attr("y1", yScale(0.5))
        .attr("y2", yScale(0.5))

    svg.append("text")
        .classed("gender-equality-text", true)
        .text("Gender equality line")
        .attr("transform", "translate(" + xScale(31) + "," + yScale(0.51) + ")")

    svg.append("text")
        .attr("class", "x axis-label")
        .attr("text-anchor", "end")
        .attr("x", xScale(60))
        .attr("y", yScale(0.01))
        .text("Median Age")
        .classed("x-axis-label", true);

    svg.append("text")
        .attr("class", "y axis-label")
        .attr("text-anchor", "middle")
        .attr("y", -45)
        .attr("x", -210)
        .attr("transform", "rotate(-90)")
        .text("Percentage female candidates")


   svg.append("text")
    .text("Hover your mouse over the circles")
    .attr("transform", "translate(" + xScale((minAge + maxAge) / 2) + "," + yScale(-0.111) + ")")
    .attr("text-anchor", "middle")
    .classed("instructions", true)

   svg.append("text")
    .text("Political party candidates for 2019")
    .attr("transform", "translate(" + xScale((minAge + maxAge) / 2) + "," + yScale(1) + ")")
    .attr("text-anchor", "middle")
    .classed("heading", true)


});
