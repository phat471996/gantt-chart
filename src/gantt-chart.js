'use strict';

var ganttChart = function(conf) {
    var api,
        self = {},
        toStr = Object.prototype.toString,
        astr = "[object Array]",
        ostr = "[object Object]",
        chart, drag, main, itemRects, tooltipDiv, xAxis, xScale, yAxis, yScale, zoom,
        resizeRectMargin = 15;

    api = {
        addItems: addItems,
        autoresize: autoresize,
        enableDrag: enableDrag,
        enableItemResize: enableItemResize,
        enabvarooltip: enableTooltip,
        enableZoom: enableZoom,
        attachEvent: attachEvent,
        chart: function() { return main },
        // drag: function() { return drag },
        items: items,
        lanes: lanes,
        margin: margin,
        showLaneLabel: showLaneLabel,
        showXGrid: showXGrid,
        showYGrid: showYGrid,
        size: size,
        sublanes: sublanes,
        getItemsByLane: getItemsByLane,
        svg: function() { return chart },
        redraw: redraw,
        renderTo: function() { return self.renderTo },
        resize: resize,
        xAxis: function() { return xAxis },
        xScale: function() { return xScale },
        yScale: function() { return yScale },
        yAxis: function() { return yAxis },
        zoom: function() { return zoom },
    };

    self.items = null;
    self.lanes = null;
    self.renderTo = '#gantt_chart';
    self.sublanes = 1;

    self.startTime = null;
    self.endTime = null;

    self.isAutoResize = true;
    self.isEnableDrag = true;
    self.isEnableItemResize = true;
    self.isEnableTooltip = true;
    self.isEnableZoom = true;
    self.isShowXGrid = true;
    self.isShowYGrid = true;
    self.isShowLaneLabel = true;
    self.duration = 20;

    self.startDrag = [];
    self.moveDrag = [];
    self.endDrag = [];

    self.height = null;
    self.width = null;
    self.itemHeight = 35;
    self.margin = {
        top: 20,
        right: 15,
        bottom: 20,
        left: 20
    };

    (function init() {
        copySameProp(self, conf);

        self.items = self.items || [];
        self.lanes = self.lanes || [];
        self.lanes.length = getLaneLength();

        if (self.height === null) self.height = parseInt(d3.select(self.renderTo).style('height')) || 480;
        if (self.width === null) self.width = parseInt(d3.select(self.renderTo).style('width')) || 640;

        build();
        autoresize(self.isAutoResize);
        enableDrag(self.isEnableDrag);
        enableTooltip(self.isEnableTooltip);
        enableZoom(self.isEnableZoom);
        showLaneLabel(self.isEnableTooltip);
        showXGrid(self.isShowXGrid);
        showYGrid(self.isShowYGrid);
        renderSublane();        
        redraw();
    })();

    function addItems(newItems) {
        var itemsType = toStr.call(newItems);
        if (itemsType !== astr && itemsType !== ostr) throwError('Expected object or array. Got: ' + itemsType);
        (itemsType === astr) ? self.items = self.items.concat(newItems) : self.items.push(newItems);
        onItemsChange();
        return api;
    }

    function autoresize(isAutoResize) {
        if (!arguments.length) return self.isAutoResize;
        d3.select(window).on('resize', (isAutoResize !== false) ? resize : null);
        self.isAutoResize = isAutoResize;
        return api;
    }

    function attachEvent(event, callback) {
        switch(event) {
            case "startDrag":
                self.startDrag.push(callback);
                break;
            case "moveDrag":
                self.moveDrag.push(callback);         
                break;
            case "endDrag":
                self.endDrag.push(callback);                
                break;
        }
        return api;
    }

    function build() {
        var laneLength = self.lanes.length,
            marginWidth = getMarginWidth(),
            marginHeight = getMarginHeight();
        chart = d3.select(self.renderTo)
            .append("svg")
            .attr("width", self.width)
            .attr("height", self.height)
            .attr("class", "gantt-chart");

        chart.append("defs").append("clipPath")
            .attr("id", "clip")
            .append("rect")
            .attr("width", marginWidth)
            .attr("height", marginHeight);

        drag = d3.behavior.drag()
            .on("dragstart", function(d) {
                dragstart(this, d);
                for(var i = 0; i < self.startDrag.length; i++) {
                    self.startDrag[i](this, d);
                }
            })
            .on("drag", function(d) {
                dragmove(this, d);
                for(var i = 0; i < self.moveDrag.length; i++) {
                    self.moveDrag[i](this, d);
                }
            } )
            .on("dragend", function(d) {
                dragend(this, d);                    
                for(var i = 0; i < self.endDrag.length; i++) {
                    self.endDrag[i](this, d);
                }
            });

        main = chart.append("g")
            .attr("transform", "translate(" + self.margin.left + "," + self.margin.top + ")")
            .attr("width", marginWidth)
            .attr("height", marginHeight)
            .attr("class", "main");

        itemRects = main.append("g")
            .attr("clip-path", "url(#clip)");

        tooltipDiv = d3.select("body").append("div")
            .attr("class", "gantt-tooltip")
            .style("opacity", 0);

        xScale = d3.time.scale()
            .domain(getTimeDomain())
            .range([0, marginWidth]);

        yScale = d3.scale.linear()
            .domain([0, laneLength])
            .range([0, marginHeight]);

        xAxis = d3.svg.axis()
            .scale(xScale)
            .orient('bottom')
            .ticks(self.duration)

        yAxis = d3.svg.axis()
            .scale(yScale)
            .orient('left')
            .ticks(laneLength)
            .tickFormat("");

        zoom = d3.behavior.zoom()
            .x(xScale);

        main.append('g')
            .attr('transform', 'translate(0,' + marginHeight + ')')
            .attr('class', 'main axis date')
            .call(xAxis)

        main.append('g')
            .attr('class', 'main axis lane')
            .call(yAxis);

        main.append('g')
            .attr('class', 'laneLabels');

        chart.call(zoom);

        d3.select('html').on("click", function(d) {
            if (!self.isEnableTooltip) return;
            if (!event.target.closest('svg rect')) {
                hideTooltip();
            }
        });

    }

    function changeCursor(d) {
        var x = parseFloat(d3.select(this).attr("x")),
            width = parseFloat(d3.select(this).attr("width")),
            x1 = x + width ;

        if ((x + self.margin.left + resizeRectMargin >= d3.event.x) || (x1 + self.margin.left - 5 <= d3.event.x)) {
            d3.select(this).attr("class", d.class === undefined ? 'success' + ((self.isEnableItemResize) ? " cursor-resize" : " cursor-default") : d.class + ((self.isEnableItemResize) ? " cursor-resize" : " cursor-default"));
        }
        else {
            d3.select(this).attr("class", d.class === undefined ? 'success' + ((self.isEnableDrag) ? " cursor-move" : " cursor-default") : d.class + ((self.isEnableDrag) ? " cursor-move" : " cursor-default"));
        }
    }

    function dragmove(thisEl, d) {
        var x = parseFloat(d3.select(thisEl).attr("x")),
            y = parseFloat(d3.select(thisEl).attr("y")),
            width = parseFloat(d3.select(thisEl).attr("width")),
            x1 = x + width,
            id = d3.select(thisEl).attr("id"),
            xText =  parseFloat(d3.select("#text-" + id).attr("x"));

        if (self.isEnableItemResize && d.isResize) {
            if (x + resizeRectMargin >= d3.event.x && x <= x1 - resizeRectMargin) {
                d.start = Date.parse(xScale.invert(x + d3.event.dx));
                showTooltip(d);

                d3.select(thisEl)
                    .attr("x", x + d3.event.dx)
                    .attr("width", width - d3.event.dx);

                d3.select("#text-" + id)
                    .attr("x", x + (width + d3.event.dx) / 2)
                    .attr("width", (width + d3.event.dx) / 2);
                return;
            }
            if (x1 - resizeRectMargin <= d3.event.x && x + 5 <= x1) {
               d.end = Date.parse(xScale.invert(parseFloat(width + d3.event.dx) + parseFloat(x)))
               showTooltip(d);

                d3.select(thisEl)
                    .attr("width", width + d3.event.dx);
                d3.select("#text-" + id)
                    .attr("x", x + (width + d3.event.dx) / 2)
                    .attr("width", (width + d3.event.dx) / 2);
                return;
            }
        }
        if (self.isEnableDrag && d.isMove) {
            d.start = Date.parse(xScale.invert(x + d3.event.dx));
            d.end = Date.parse(xScale.invert(parseFloat(width + d3.event.dx) + parseFloat(x)))
            showTooltip(d);

            d3.select(thisEl)
                .attr("x", x + d3.event.dx)
                .attr("y", y + d3.event.dy);
            d3.select("#text-" + id)
                .attr("x", xText + d3.event.dx)
                .attr("y", (y + self.itemHeight/2) + d3.event.dy);
        }
    }

    function dragend(thisEl, d) {
        if (!self.isEnableDrag && !self.isEnableItemResize) return;
        var el = d3.select(thisEl),
            lane = Math.floor(yScale.invert(el.attr("y"))),
            start = el.attr("x"),
            id = el.attr("id");
            
        if (lane >= self.lanes.length) {
            lane = self.lanes.length - 1;
        }
        if (lane < 0) {
            lane = 0;
        }

        delete d.isResize;
        delete d.isMove;

        el.attr("y", yScale(lane));
        d3.select("#text-" + id).attr("y", yScale(lane) + self.itemHeight/2);

        d.lane = lane;

        d.start = Date.parse(xScale.invert(parseFloat(start)));
        
        d.end = Date.parse(xScale.invert(parseFloat(el.attr("width")) + parseFloat(start)));
        
        hideTooltip();
        renderSublane();
        redraw();

    }

    function dragstart(thisEl, d) {
        if (!self.isEnableDrag && !self.isEnableItemResize) return;
        var cursor = d3.select(thisEl).attr("class");
        if(cursor.includes("cursor-resize")) {
            d.isResize = true
        }
        else if(cursor.includes("cursor-move")) {
            d.isMove = true
        }

        d.oldStart = d.start;
        d.oldEnd = d.end;
        d3.event.sourceEvent.stopPropagation();
    }

    function copySameProp(copyTo, copyFrom) {
        var p;

        for (p in copyFrom) {
            if (copyTo.hasOwnProperty(p)) {
                if (toStr.call(copyFrom[p]) === ostr) {
                    copySameProp(copyTo[p], copyFrom[p]);
                }
                else {
                    copyTo[p] = copyFrom[p];
                }
            }
        }
    }

    function enableDrag(isEnableDrag) {
        if (!arguments.length) return self.isEnableDrag;
        self.isEnableDrag = isEnableDrag;
        redraw();
        return api;
    }

    function enableItemResize(isEnableItemResize) {
        if (!arguments.length) return self.isEnableItemResize;
        self.isEnableItemResize = isEnableItemResize;
        redraw();
        return api;
    }

    function enableTooltip(isEnableTooltip) {
        if (!arguments.length) return self.isEnableTooltip;
        self.isEnableTooltip = isEnableTooltip;
        redraw();
        return api;
    }

    function enableZoom(isEnableZoom) {
        if (!arguments.length) return self.isEnableZoom;
        zoom.on("zoom", (isEnableZoom) ? redraw : null);
        self.isEnableZoom = isEnableZoom;
        return api;
    }

    function getLaneLength() {
        return (d3.max(self.items, function(d) { return d.lane }) + 1) || 0;
    }

    function getMarginWidth() {
        return self.width - self.margin.right - self.margin.left;
    }

    function getMarginHeight() {
        return self.height - self.margin.top - self.margin.bottom;
    }

    function getTimeDomain() {
        return [
            self.startTime  || d3.min(self.items, function(d) { return d.start }),
            self.endTime    || d3.max(self.items, function(d) { return d.end })
        ];
    }

    function hideTooltip() {
        tooltipDiv.transition()
            .duration(500)
            .style("opacity", 0)
            .style("display", "none");
    }

    function items(newItems) {
        var itemsType = toStr.call(newItems);

        if (!arguments.length) return self.items;
        if (itemsType !== astr) throwError('Expected array. Got: ' + itemsType);
        self.items = newItems;

        onItemsChange();
        return api;
    }

    function lanes(newLanes) {
        var lanesType = toStr.call(newLanes);
        if (!arguments.length) return self.lanes;
        if (lanesType !== astr) throwError('Expected array. Got: ' + lanesType);
        self.lanes = newLanes;
        self.lanes.length = getLaneLength() || self.lanes.length;
        showLaneLabel(!self.isShowLaneLabel);
        // showLaneLabel(!self.isShowLaneLabel);
        return api;
    }

    function margin(newMargin) {
        var msg = " margin value is incorrect. All values should be numbers";
        if (!arguments.length) return self.margin;
        if (newMargin.top !== undefined) {
            if (isNaN(newMargin.top)) throwError("'Top'" + msg);
            self.margin.top = parseInt(newMargin.top);
            main.attr("transform", "translate(" + self.margin.left + "," + self.margin.top + ")");
        }
        if (newMargin.right !== undefined) {
            if (isNaN(newMargin.right)) throwError("'Right'" + msg);
            self.margin.right = parseInt(newMargin.right);
        }
        if (newMargin.bottom !== undefined) {
            if (isNaN(newMargin.bottom)) throwError("'Bottom'" + msg);
            self.margin.bottom = parseInt(newMargin.bottom);
        }
        if (newMargin.left !== undefined) {
            if (isNaN(newMargin.left)) throwError("'Left'" + msg);
            self.margin.left = parseInt(newMargin.left);
            main.attr("transform", "translate(" + self.margin.left + "," + self.margin.top + ")");
        }

        resize();
        return api;
    }

    function onItemsChange() {
        var laneLength = getLaneLength();
        self.lanes.length = laneLength;
        xScale.domain(getTimeDomain());
        yAxis.ticks(laneLength);
        yScale.domain([0, laneLength]);
        zoom.x(xScale);
        redraw();
        redraw();
    }

    function redraw() {
        var rects;

        rects = itemRects.selectAll("rect")
            .data(self.items)
            .attr("id", function(d) { return d.id })
            .attr("x", function (d) { return xScale(d.start); })
            .attr("y", function (d) {
                return (self.sublanes < 2) ? yScale(d.lane) : yScale(d.lane) + d.sublane*self.itemHeight;
            })
            .attr("width", function (d) { return xScale(d.end) - xScale(d.start); })
            .attr("height", self.itemHeight)
            .attr("class", function (d) { return d.class ===  undefined ? 'success' : d.class; })
            // .attr("opacity", .75)
            .call(drag)
            .on("mouseover", (self.isEnableTooltip) ? showTooltip : null)
            .on("mouseleave", (self.isEnableTooltip) ? hideTooltip : null)
            .on("mousemove", changeCursor);

        rects.enter().append("rect");
        rects.exit().remove();

        var texts = itemRects.selectAll("text")
            .data(self.items)
            .text(function(d){
            return d.label;
            })
            .attr("id", function(d) { return "text-" + d.id })
            .attr("x", function(d) { return xScale(d.start) + (xScale(d.end) - xScale(d.start)) / 2; })
            .attr("y",function (d) {
                return (self.sublanes < 2) ? yScale(d.lane) + self.itemHeight/2 : yScale(d.lane) + d.sublane*self.itemHeight + self.itemHeight/2;
            })
            .attr("font-size", 11)
            .attr("text-anchor", "middle")
            .attr("text-height", 20)
            .attr("fill", function (d) { return d.fillTitle === undefined ? '#fff' + ' main' : d.fillTitle + ' main'; })
            // .attr("fill", "#fff");

        texts.enter().append("text");
        texts.exit().remove();
        
        main.select('g.main.axis.date').call(xAxis);
        main.select('g.main.axis.lane').call(yAxis);

        hideTooltip();
    }

    function resize() {
        if (self.isAutoResize) {
            self.width = parseInt(d3.select(self.renderTo).style('width'));
            self.height = parseInt(d3.select(self.renderTo).style('height'));
        }
        var marginWidth = getMarginWidth(),
            marginHeight = getMarginHeight();

        xScale.range([0, marginWidth]);
        yScale.range([0, marginHeight]);
        chart.attr("width", self.width);
        chart.attr("height", self.height);
        chart.select('defs').select('clipPath').select('rect').attr("width", marginWidth);
        chart.select('defs').select('clipPath').select('rect').attr("height", marginWidth);
        main.attr("width", marginWidth);
        main.attr("height", marginHeight);

        main.select('g.main.axis.date')
            .attr('transform', 'translate(0,' + getMarginHeight() + ')');

        main.select('g.laneLabels')
            .selectAll(".laneText")
            .data(self.lanes)
            .attr("y", function(d, i) {return yScale(i + .5);})

        zoom.x(xScale);

        showXGrid(self.isShowYGrid);
        showYGrid(self.isShowYGrid);

        redraw();
    }

    function showLaneLabel(isShowLaneLabel) {
        if (!arguments.length) return self.isShowLaneLabel;
        self.isShowLaneLabel = isShowLaneLabel;
        if (isShowLaneLabel === false) {
            main.selectAll(".laneText").remove();
        }
        else {
            main.select('g.laneLabels').selectAll(".laneText")
                .data(self.lanes)
                .enter().append("text")
                .text(function(d) {return d;})
                .attr('id',function(d, index) {return 'lane-' + index;})
                .attr("x", -self.margin.left)
                .attr("y", function(d, i) {return yScale(i + .5);})
                .attr("dy", ".5ex")
                .attr("text-anchor", "start")
                .attr("class", "laneText");
        }

        return api;
    }

    function showTooltip(d) {
        if (d3.event.defaultPrevented) return;
        tooltipDiv.style("display", "block")
            .transition()
            .duration(200)
            .style("opacity", .9);
        tooltipDiv.html((typeof d.tooltip === 'function') ? d.tooltip() : d.tooltip)
            .style("left", (d3.event.pageX) + "px")
            .style("top", (d3.event.pageY) + "px");
    }

    function renderSublane() {
        
        separateSublane();

        var max = getMaxSubLane();
        
        size(self.width,  max.max*self.itemHeight*self.lanes.length + self.margin.top + self.margin.bottom);
        
        self.sublanes = max.max;
    }

    function showXGrid(isShowXGrid) {
        if (!arguments.length) return self.isShowXGrid;
        var height = (isShowXGrid !== false) ? -getMarginHeight() : -6;
        xAxis.tickSize(height, 0, 0);
        self.isShowXGrid = isShowXGrid;
        main.select('g.main.axis.date').call(xAxis);
        return api;
    }

    function showYGrid(isShowYGrid) {
        if (!arguments.length) return self.isShowYGrid;
        var width = (isShowYGrid !== false) ? -getMarginWidth() : -6;
        yAxis.tickSize(width, 0, 0);
        self.isShowYGrid = isShowYGrid;
        main.select('g.main.axis.lane').call(yAxis);
        return api;
    }

    function size(width, height) {
        if (!arguments.length) return [self.width, self.height];
        self.width = parseInt(width) || self.width;
        self.height = parseInt(height) || self.height;
        autoresize(false);
        resize();
        return api;
    }

    function sublanes(newSublanes) {
        if (!arguments.length) return self.sublanes;
        self.sublanes = newSublanes;
        redraw();
        return api;
    }

    // function getItemHeight() {
    //     return getMarginHeight() / (self.lanes.length || 1) / (self.sublanes || 1);
    // }

    function getItemsByLane(lane) {
        return self.items.filter(function(item) {
            return item.lane == lane;
        })
    }

    function separateSublane() {
        for(var l = 0; l < self.lanes.length; l++) {
            var itemLanes = self.items.filter(function(obj) {
                return obj.lane == l;
            });
            for(var i = 0; i < itemLanes.length; i++) {
                var item = itemLanes[i];
                var itemChange = self.items.find(
                    function(obj){ return obj.id === item.id}
                );
                itemChange.sublane = i;
            }
        }        
    }

    function getMaxSubLane() {
        var maxSublane = {
            max: 0,
            lanes: []
        }

        d3.max(self.items, function(d) { 
            if((d.sublane + 1) > maxSublane.max) {
                maxSublane.max = d.sublane + 1;
            }
        });

        maxSublane.lanes = self.items
                                .filter(function(obj) {
                                    return obj.sublane == (maxSublane.max - 1);
                                })
                                .map(function(obj) {
                                    return obj.lane;
                                })

        return maxSublane;
    }

    function throwError(msg) {
        throw TypeError(msg);
    }

    return api;
}
