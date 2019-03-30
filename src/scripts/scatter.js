import * as d3 from "./d3"

var parties = [
    {
        "male": 620,
        "female": 410,
        "medianAge": 43.0,
        "party": "Democratic Alliance",
        "total": 1030,
        "femaleRatio": 0.4
    },
    {
        "male": 604,
        "female": 371,
        "medianAge": 43,
        "party": "African Transformation Movement",
        "total": 975,
        "femaleRatio": 0.38
    },
    {
        "male": 384,
        "female": 457,
        "medianAge": 43,
        "party": "African People's Convention",
        "total": 841,
        "femaleRatio": 0.54
    },
    {
        "male": 418,
        "female": 412,
        "medianAge": 41.0,
        "party": "Economic Freedom Fighters",
        "total": 830,
        "femaleRatio": 0.5
    },
    {
        "male": 412,
        "female": 415,
        "medianAge": 52,
        "party": "African National Congress",
        "total": 827,
        "femaleRatio": 0.5
    },
    {
        "male": 481,
        "female": 279,
        "medianAge": 42.0,
        "party": "Good",
        "total": 760,
        "femaleRatio": 0.37
    },
    {
        "male": 378,
        "female": 235,
        "medianAge": 49,
        "party": "African Christian Democratic Party",
        "total": 613,
        "femaleRatio": 0.38
    },
    {
        "male": 223,
        "female": 316,
        "medianAge": 38,
        "party": "International Revelation Congress",
        "total": 539,
        "femaleRatio": 0.59
    },
    {
        "male": 295,
        "female": 184,
        "medianAge": 41,
        "party": "African Content Movement",
        "total": 479,
        "femaleRatio": 0.38
    },
    {
        "male": 280,
        "female": 172,
        "medianAge": 52.5,
        "party": "Congress  Of The People",
        "total": 452,
        "femaleRatio": 0.38
    },
    {
        "male": 306,
        "female": 138,
        "medianAge": 53.0,
        "party": "Vryheidsfront Plus",
        "total": 444,
        "femaleRatio": 0.31
    },
    {
        "male": 287,
        "female": 139,
        "medianAge": 49.0,
        "party": "Azanian People's Organisation",
        "total": 426,
        "femaleRatio": 0.33
    },
    {
        "male": 252,
        "female": 152,
        "medianAge": 42.0,
        "party": "United Democratic Movement",
        "total": 404,
        "femaleRatio": 0.38
    },
    {
        "male": 294,
        "female": 109,
        "medianAge": 46,
        "party": "Pan Africanist Congress Of Azania",
        "total": 403,
        "femaleRatio": 0.27
    },
    {
        "male": 3,
        "female": 346,
        "medianAge": 42,
        "party": "Women Forward",
        "total": 349,
        "femaleRatio": 0.99
    },
    {
        "male": 205,
        "female": 103,
        "medianAge": 41.5,
        "party": "Socialist Revolutionary Workers Party",
        "total": 308,
        "femaleRatio": 0.33
    },
    {
        "male": 167,
        "female": 125,
        "medianAge": 48.0,
        "party": "National Freedom Party",
        "total": 292,
        "femaleRatio": 0.43
    },
    {
        "male": 196,
        "female": 95,
        "medianAge": 38,
        "party": "African Democratic Change",
        "total": 291,
        "femaleRatio": 0.33
    },
    {
        "male": 164,
        "female": 114,
        "medianAge": 47.0,
        "party": "African Covenant",
        "total": 278,
        "femaleRatio": 0.41
    },
    {
        "male": 175,
        "female": 99,
        "medianAge": 49.0,
        "party": "Alliance For Transformation For All",
        "total": 274,
        "femaleRatio": 0.36
    },
    {
        "male": 161,
        "female": 100,
        "medianAge": 41,
        "party": "Christian Political Movement",
        "total": 261,
        "femaleRatio": 0.38
    },
    {
        "male": 61,
        "female": 168,
        "medianAge": 34,
        "party": "Agang South Africa",
        "total": 229,
        "femaleRatio": 0.73
    },
    {
        "male": 136,
        "female": 93,
        "medianAge": 37,
        "party": "Black First Land First",
        "total": 229,
        "femaleRatio": 0.41
    },
    {
        "male": 131,
        "female": 96,
        "medianAge": 42,
        "party": "African Independent Congress",
        "total": 227,
        "femaleRatio": 0.42
    },
    {
        "male": 113,
        "female": 102,
        "medianAge": 40,
        "party": "Power Of Africans Unity",
        "total": 215,
        "femaleRatio": 0.47
    },
    {
        "male": 131,
        "female": 81,
        "medianAge": 41.0,
        "party": "Forum 4 Service Delivery",
        "total": 212,
        "femaleRatio": 0.38
    },
    {
        "male": 121,
        "female": 89,
        "medianAge": 45.0,
        "party": "Inkatha Freedom Party",
        "total": 210,
        "femaleRatio": 0.42
    },
    {
        "male": 100,
        "female": 70,
        "medianAge": 39.0,
        "party": "South African National Congress Of Traditional Authorities",
        "total": 170,
        "femaleRatio": 0.41
    },
    {
        "male": 87,
        "female": 78,
        "medianAge": 39,
        "party": "National Peoples Ambassadors",
        "total": 165,
        "femaleRatio": 0.47
    },
    {
        "male": 92,
        "female": 55,
        "medianAge": 44,
        "party": "Economic Emancipation Forum",
        "total": 147,
        "femaleRatio": 0.37
    },
    {
        "male": 76,
        "female": 61,
        "medianAge": 43,
        "party": "Better Residents Association",
        "total": 137,
        "femaleRatio": 0.45
    },
    {
        "male": 74,
        "female": 63,
        "medianAge": 37,
        "party": "Land Party",
        "total": 137,
        "femaleRatio": 0.46
    },
    {
        "male": 66,
        "female": 37,
        "medianAge": 45,
        "party": "National People's Front",
        "total": 103,
        "femaleRatio": 0.36
    },
    {
        "male": 55,
        "female": 46,
        "medianAge": 36,
        "party": "Afrikan Alliance Of Social Democrats",
        "total": 101,
        "femaleRatio": 0.46
    },
    {
        "male": 63,
        "female": 33,
        "medianAge": 53.0,
        "party": "African Renaissance Unity",
        "total": 96,
        "femaleRatio": 0.34
    },
    {
        "male": 41,
        "female": 55,
        "medianAge": 43.0,
        "party": "People's Revolutionary Movement",
        "total": 96,
        "femaleRatio": 0.57
    },
    {
        "male": 52,
        "female": 40,
        "medianAge": 42.0,
        "party": "African Congress Of Democrats",
        "total": 92,
        "femaleRatio": 0.43
    },
    {
        "male": 34,
        "female": 51,
        "medianAge": 38,
        "party": "Free Democrats",
        "total": 85,
        "femaleRatio": 0.6
    },
    {
        "male": 50,
        "female": 34,
        "medianAge": 55.0,
        "party": "Al Jama-Ah",
        "total": 84,
        "femaleRatio": 0.4
    },
    {
        "male": 38,
        "female": 32,
        "medianAge": 50.0,
        "party": "Compatriots Of South Africa",
        "total": 70,
        "femaleRatio": 0.46
    },
    {
        "male": 33,
        "female": 23,
        "medianAge": 40.0,
        "party": "Patriotic Alliance",
        "total": 56,
        "femaleRatio": 0.41
    },
    {
        "male": 7,
        "female": 49,
        "medianAge": 44.0,
        "party": "South African Maintanance And Estate Beneficiaries Association",
        "total": 56,
        "femaleRatio": 0.88
    },
    {
        "male": 25,
        "female": 29,
        "medianAge": 47.5,
        "party": "Minority Front",
        "total": 54,
        "femaleRatio": 0.54
    },
    {
        "male": 19,
        "female": 27,
        "medianAge": 48.5,
        "party": "African People's Socialist Party",
        "total": 46,
        "femaleRatio": 0.59
    },
    {
        "male": 24,
        "female": 22,
        "medianAge": 43.5,
        "party": "Gaza Movement For Change",
        "total": 46,
        "femaleRatio": 0.48
    },
    {
        "male": 27,
        "female": 18,
        "medianAge": 52,
        "party": "Independent Civic Organisation Of South Africa",
        "total": 45,
        "femaleRatio": 0.4
    },
    {
        "male": 26,
        "female": 13,
        "medianAge": 52,
        "party": "Cape Party/ Kaapse Party",
        "total": 39,
        "femaleRatio": 0.33
    },
    {
        "male": 12,
        "female": 25,
        "medianAge": 43,
        "party": "People's Republic Of South Africa",
        "total": 37,
        "femaleRatio": 0.68
    },
    {
        "male": 21,
        "female": 14,
        "medianAge": 52,
        "party": "Democratic Liberal Congress",
        "total": 35,
        "femaleRatio": 0.4
    },
    {
        "male": 20,
        "female": 15,
        "medianAge": 47,
        "party": "Plaaslike Besorgde Inwoners",
        "total": 35,
        "femaleRatio": 0.43
    },
    {
        "male": 17,
        "female": 14,
        "medianAge": 56,
        "party": "United Christian Democratic Party",
        "total": 31,
        "femaleRatio": 0.45
    },
    {
        "male": 18,
        "female": 13,
        "medianAge": 49,
        "party": "African Progressive Movement",
        "total": 31,
        "femaleRatio": 0.42
    },
    {
        "male": 14,
        "female": 16,
        "medianAge": 45.0,
        "party": "Residence Association Of South Africa",
        "total": 30,
        "femaleRatio": 0.53
    },
    {
        "male": 20,
        "female": 9,
        "medianAge": 44,
        "party": "South African Political Party",
        "total": 29,
        "femaleRatio": 0.31
    },
    {
        "male": 11,
        "female": 16,
        "medianAge": 34,
        "party": "African Change Academy",
        "total": 27,
        "femaleRatio": 0.59
    },
    {
        "male": 18,
        "female": 9,
        "medianAge": 44,
        "party": "Sindawonye Progressive Party",
        "total": 27,
        "femaleRatio": 0.33
    },
    {
        "male": 18,
        "female": 7,
        "medianAge": 46,
        "party": "Front Nasionaal/Front National",
        "total": 25,
        "femaleRatio": 0.28
    },
    {
        "male": 22,
        "female": 1,
        "medianAge": 46,
        "party": "Capitalist Party Of South Africa",
        "total": 23,
        "femaleRatio": 0.04
    },
    {
        "male": 15,
        "female": 4,
        "medianAge": 38,
        "party": "African Security Congress",
        "total": 19,
        "femaleRatio": 0.21
    },
    {
        "male": 9,
        "female": 9,
        "medianAge": 49.5,
        "party": "Ximoko Party",
        "total": 18,
        "femaleRatio": 0.5
    },
    {
        "male": 7,
        "female": 10,
        "medianAge": 35,
        "party": "South African Concerned Residents Organisation 4 Service Del",
        "total": 17,
        "femaleRatio": 0.59
    },
    {
        "male": 12,
        "female": 3,
        "medianAge": 48,
        "party": "Gazankulu Liberation Congress",
        "total": 15,
        "femaleRatio": 0.2
    },
    {
        "male": 7,
        "female": 7,
        "medianAge": 43.0,
        "party": "Zenzeleni Progressive Movement",
        "total": 14,
        "femaleRatio": 0.5
    },
    {
        "male": 10,
        "female": 4,
        "medianAge": 51.5,
        "party": "Khoisan Revolution",
        "total": 14,
        "femaleRatio": 0.29
    },
    {
        "male": 9,
        "female": 4,
        "medianAge": 49,
        "party": "Aboriginal Khoisan",
        "total": 13,
        "femaleRatio": 0.31
    },
    {
        "male": 8,
        "female": 4,
        "medianAge": 46.0,
        "party": "Magoshi Swaranang Movement",
        "total": 12,
        "femaleRatio": 0.33
    },
    {
        "male": 6,
        "female": 6,
        "medianAge": 53.0,
        "party": "Reikemetse Dikgabo Party",
        "total": 12,
        "femaleRatio": 0.5
    },
    {
        "male": 3,
        "female": 8,
        "medianAge": 38,
        "party": "Justice And Employment Party",
        "total": 11,
        "femaleRatio": 0.73
    },
    {
        "male": 3,
        "female": 8,
        "medianAge": 47,
        "party": "The Green Party Of South Africa",
        "total": 11,
        "femaleRatio": 0.73
    },
    {
        "male": 4,
        "female": 6,
        "medianAge": 46.5,
        "party": "Uniting People First",
        "total": 10,
        "femaleRatio": 0.6
    },
    {
        "male": 4,
        "female": 6,
        "medianAge": 36.0,
        "party": "New South Africa Party",
        "total": 10,
        "femaleRatio": 0.6
    },
    {
        "male": 7,
        "female": 2,
        "medianAge": 38,
        "party": "Civic Warriors Of Maruleng",
        "total": 9,
        "femaleRatio": 0.22
    },
    {
        "male": 4,
        "female": 5,
        "medianAge": 36,
        "party": "All Things Are Possible",
        "total": 9,
        "femaleRatio": 0.56
    },
    {
        "male": 5,
        "female": 3,
        "medianAge": 51.0,
        "party": "National Religious Freedom Party",
        "total": 8,
        "femaleRatio": 0.38
    },
    {
        "male": 7,
        "female": 1,
        "medianAge": 49.5,
        "party": "Karoo Democratic Force",
        "total": 8,
        "femaleRatio": 0.12
    },
    {
        "male": 3,
        "female": 3,
        "medianAge": 37.5,
        "party": "African Mantungwa Community",
        "total": 6,
        "femaleRatio": 0.5
    },
    {
        "male": 5,
        "female": 1,
        "medianAge": 47.0,
        "party": "Bolsheviks Party Of South Africa",
        "total": 6,
        "femaleRatio": 0.17
    },
    {
        "male": 3,
        "female": 2,
        "medianAge": 34,
        "party": "Dienslewerings Party",
        "total": 5,
        "femaleRatio": 0.4
    }
]

var margin = {top: 19.5, right: 19.5, bottom: 80.5, left: 70},
    width = 960 - margin.right,
    height = 500 - margin.top - margin.bottom;
var minAge = 30, maxAge = 60;

var xScale = d3.scaleLinear().domain([minAge, maxAge]).range([0, width]).nice(),
    yScale = d3.scaleLinear().domain([1, 0]).range([0, height]).nice(),
    colorScale = d3.schemeCategory10,
    radiusScale = d3.scaleLinear().domain([0, 1000]).range([0, 40]),
    xAxis = d3.axisBottom(xScale).ticks(12, ",d"),
    yAxis = d3.axisLeft(yScale)

var container = d3.select("#chart")

var svg = container.append("svg")
    .attr("viewBox", "0 0 " + (width * 1.2) + " " + (height * 1.2) )
    .attr("preserveAspectRatio", "xMidYMid meet")
    .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

svg.append("g")
    .attr("class", "x axis")
    .attr("transform", "translate(0," + height + ")")
    .call(xAxis);

svg.append("g")
    .attr("class", "y axis")
    .call(yAxis);

var position = function(dot) {
    dot
      .attr("cx", function(d) { return xScale(d.medianAge); })
      .attr("cy", function(d) { return yScale(d.femaleRatio); })
      .attr("r", function(d) { return radiusScale(d.total); });
}

var tooltip = container.append("div")
    .attr("id", "tooltip")
tooltip.append("p").attr("class", "party-name")
tooltip.append("p").attr("class", "candidates")
tooltip.append("p").attr("class", "women")
tooltip.append("p").attr("class", "men")
tooltip.append("p").attr("class", "median-age")

svg.selectAll("circle").data(parties).enter()
    .append("circle")
        .classed("dot", true)
        .style("fill", function(d, idx) {
            return colorScale[idx % 10]
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
            tooltip.select(".median-age").text("Median Age: " + el.medianAge + " years")
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
    .text("Older candidates ⮀")
    .classed("x-axis-label", true);

svg.append("text")
    .attr("class", "x axis-label")
    .attr("text-anchor", "start")
    .attr("x", xScale(30.3))
    .attr("y", yScale(0.01))
    .text("⮂ Younger candidates")
    .classed("x-axis-label", true);

svg.append("text")
    .attr("class", "y axis-label")
    .attr("text-anchor", "middle")
    .attr("y", -45)
    .attr("x", -210)
    .attr("transform", "rotate(-90)")
    .text("Percentage female candidates")


svg.append("text")
.text("Median age of candidates (years)")
.attr("transform", "translate(" + xScale((minAge + maxAge) / 2) + "," + yScale(-0.09) + ")")
.attr("text-anchor", "middle")
.classed("x-axis-label", true)

svg.append("text")
.text("Hover over the circles for more information")
.attr("transform", "translate(" + xScale((minAge + maxAge) / 2) + "," + yScale(-0.13) + ")")
.attr("text-anchor", "middle")
.classed("instructions", true)
.classed("x-axis-label", true)

svg.append("text")
.text("Political party candidates for 2019")
.attr("transform", "translate(" + xScale((minAge + maxAge) / 2) + "," + yScale(1) + ")")
.attr("text-anchor", "middle")
.classed("heading", true)

