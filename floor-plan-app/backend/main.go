package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"sort"
)

type Opening struct {
	ID        string  `json:"id"`
	Type      string  `json:"type"`      // "door" or "window"
	Wall      string  `json:"wall"`      // "N", "S", "E", "W"
	Position  float64 `json:"position"`  // distance in meters from wall start
	Width     float64 `json:"width"`     // width in meters
	FlipHinge bool    `json:"flipHinge,omitempty"`
	FlipSwing bool    `json:"flipSwing,omitempty"`
}

type RoomConfig struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Type          string    `json:"type,omitempty"` // "living", "bedroom", "kitchen", "bathroom", "dining", "balcony", "corridor", "office", etc.
	X             float64   `json:"x"`              // meters from plan origin
	Y             float64   `json:"y"`              // meters from plan origin
	Breadth       float64   `json:"breadth"`        // X-axis dimension (East-West) in meters
	Length        float64   `json:"length"`         // Y-axis dimension (North-South) in meters
	WallThickness float64   `json:"wallThickness,omitempty"`
	Openings      []Opening `json:"openings"`
}

type MultiRoomConfig struct {
	Name                  string       `json:"name"`
	ExteriorWallThickness float64      `json:"exteriorWallThickness"` // e.g. 0.20m
	InteriorWallThickness float64      `json:"interiorWallThickness"` // e.g. 0.10m
	Rooms                 []RoomConfig `json:"rooms"`
}

type RoomScheduleItem struct {
	ID                string  `json:"id"`
	Name              string  `json:"name"`
	Type              string  `json:"type"`
	X                 float64 `json:"x"`
	Y                 float64 `json:"y"`
	Breadth           float64 `json:"breadth"`
	Length            float64 `json:"length"`
	AreaSqm           float64 `json:"area_sqm"`
	AreaSqft          float64 `json:"area_sqft"`
	PerimeterM        float64 `json:"perimeter_m"`
	WindowAreaSqm     float64 `json:"window_area_sqm"`
	DaylightRatio     float64 `json:"daylight_ratio_percent"`
	DaylightCompliant bool    `json:"daylight_compliant"`
}

type MultiRoomMetrics struct {
	TotalCarpetAreaSqm   float64            `json:"total_carpet_area_sqm"`
	TotalCarpetAreaSqft  float64            `json:"total_carpet_area_sqft"`
	GrossBuiltUpAreaSqm  float64            `json:"gross_built_up_area_sqm"`
	GrossBuiltUpAreaSqft float64            `json:"gross_built_up_area_sqft"`
	BoundingWidthM       float64            `json:"bounding_width_m"`
	BoundingHeightM      float64            `json:"bounding_height_m"`
	RoomCount            int                `json:"room_count"`
	EfficiencyPercent    float64            `json:"efficiency_percent"`
	Schedule             []RoomScheduleItem `json:"schedule"`
	Warnings             []string           `json:"warnings"`
}

type MultiRoomValidationResponse struct {
	Status    string           `json:"status"`
	Metrics   MultiRoomMetrics `json:"metrics"`
	FloorPlan MultiRoomConfig  `json:"floorPlan"`
}

// Single-room legacy compatibility types
type RoomMetrics struct {
	GrossAreaSqm       float64  `json:"gross_area_sqm"`
	GrossAreaSqft      float64  `json:"gross_area_sqft"`
	WallPerimeterM     float64  `json:"wall_perimeter_m"`
	TotalWindowAreaSqm float64  `json:"total_window_area_sqm"`
	DaylightRatio      float64  `json:"daylight_ratio_percent"`
	DaylightCompliant  bool     `json:"daylight_compliant"`
	Warnings           []string `json:"warnings"`
}

type ValidationResponse struct {
	Status  string      `json:"status"`
	Metrics RoomMetrics `json:"metrics"`
	Room    RoomConfig  `json:"room"`
}

func enableCors(w *http.ResponseWriter) {
	(*w).Header().Set("Access-Control-Allow-Origin", "*")
	(*w).Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
	(*w).Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func handleValidate(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req RoomConfig
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Breadth <= 0 {
		req.Breadth = 5.0
	}
	if req.Length <= 0 {
		req.Length = 4.0
	}
	if req.WallThickness <= 0 {
		req.WallThickness = 0.20
	}

	grossArea := req.Breadth * req.Length
	grossAreaSqft := grossArea * 10.7639
	perimeter := 2 * (req.Breadth + req.Length)

	var totalWindowArea float64
	var warnings []string

	wallOpenings := make(map[string][]Opening)
	for _, op := range req.Openings {
		wallOpenings[op.Wall] = append(wallOpenings[op.Wall], op)
		if op.Type == "window" {
			totalWindowArea += op.Width * 1.4
		}
	}

	for wall, ops := range wallOpenings {
		var wallLen float64
		if wall == "N" || wall == "S" {
			wallLen = req.Breadth
		} else {
			wallLen = req.Length
		}

		sort.Slice(ops, func(i, j int) bool {
			return ops[i].Position < ops[j].Position
		})

		for i, op := range ops {
			if op.Position+op.Width > wallLen {
				warnings = append(warnings, fmt.Sprintf("Opening %s on Wall %s exceeds wall length (%.2fm > %.2fm)", op.ID, wall, op.Position+op.Width, wallLen))
			}
			if op.Position < 0.1 {
				warnings = append(warnings, fmt.Sprintf("Opening %s on Wall %s is close to the corner (< 0.10m)", op.ID, wall))
			}
			if op.Position+op.Width > wallLen-0.1 {
				warnings = append(warnings, fmt.Sprintf("Opening %s on Wall %s is close to the far corner (< 0.10m)", op.ID, wall))
			}
			if i+1 < len(ops) {
				next := ops[i+1]
				if op.Position+op.Width > next.Position {
					warnings = append(warnings, fmt.Sprintf("Overlapping openings on Wall %s (%s and %s)", wall, op.ID, next.ID))
				}
			}
		}
	}

	daylightRatio := 0.0
	if grossArea > 0 {
		daylightRatio = (totalWindowArea / grossArea) * 100
	}
	daylightCompliant := daylightRatio >= 10.0

	metrics := RoomMetrics{
		GrossAreaSqm:       grossArea,
		GrossAreaSqft:      grossAreaSqft,
		WallPerimeterM:     perimeter,
		TotalWindowAreaSqm: totalWindowArea,
		DaylightRatio:      daylightRatio,
		DaylightCompliant:  daylightCompliant,
		Warnings:           warnings,
	}

	resp := ValidationResponse{
		Status:  "success",
		Metrics: metrics,
		Room:    req,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func handleValidateMultiRoom(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req MultiRoomConfig
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.ExteriorWallThickness <= 0 {
		req.ExteriorWallThickness = 0.20
	}
	if req.InteriorWallThickness <= 0 {
		req.InteriorWallThickness = 0.10
	}

	var totalCarpetSqm float64
	var minX, minY, maxX, maxY float64
	var schedule []RoomScheduleItem
	var warnings []string

	if len(req.Rooms) > 0 {
		minX = req.Rooms[0].X
		minY = req.Rooms[0].Y
		maxX = req.Rooms[0].X + req.Rooms[0].Breadth
		maxY = req.Rooms[0].Y + req.Rooms[0].Length
	}

	for i, rm := range req.Rooms {
		rMinX := rm.X
		rMinY := rm.Y
		rMaxX := rm.X + rm.Breadth
		rMaxY := rm.Y + rm.Length

		if rMinX < minX {
			minX = rMinX
		}
		if rMinY < minY {
			minY = rMinY
		}
		if rMaxX > maxX {
			maxX = rMaxX
		}
		if rMaxY > maxY {
			maxY = rMaxY
		}

		areaSqm := rm.Breadth * rm.Length
		totalCarpetSqm += areaSqm
		perimeter := 2 * (rm.Breadth + rm.Length)

		var winArea float64
		for _, op := range rm.Openings {
			if op.Type == "window" {
				winArea += op.Width * 1.4
			}
		}

		dlRatio := 0.0
		if areaSqm > 0 {
			dlRatio = (winArea / areaSqm) * 100
		}
		dlCompliant := dlRatio >= 10.0

		// Habitable rooms (bedroom, living) should have daylight
		if (rm.Type == "living" || rm.Type == "bedroom") && !dlCompliant {
			warnings = append(warnings, fmt.Sprintf("%s (%s) has %.1f%% daylight ratio (minimum 10%% recommended)", rm.Name, rm.Type, dlRatio))
		}

		// Aspect ratio check (avoid overly narrow rooms)
		aspect := rm.Breadth / math.Max(0.1, rm.Length)
		if aspect > 2.5 || aspect < 0.4 {
			warnings = append(warnings, fmt.Sprintf("%s has an extreme aspect ratio (%.1f:1)", rm.Name, aspect))
		}

		schedule = append(schedule, RoomScheduleItem{
			ID:                rm.ID,
			Name:              rm.Name,
			Type:              rm.Type,
			X:                 rm.X,
			Y:                 rm.Y,
			Breadth:           rm.Breadth,
			Length:            rm.Length,
			AreaSqm:           math.Round(areaSqm*100) / 100,
			AreaSqft:          math.Round(areaSqm*10.7639*10) / 10,
			PerimeterM:        math.Round(perimeter*100) / 100,
			WindowAreaSqm:     math.Round(winArea*100) / 100,
			DaylightRatio:     math.Round(dlRatio*10) / 10,
			DaylightCompliant: dlCompliant,
		})

		// Room collision / overlap check
		for j := i + 1; j < len(req.Rooms); j++ {
			other := req.Rooms[j]
			overlapX := math.Max(0, math.Min(rMaxX, other.X+other.Breadth)-math.Max(rMinX, other.X))
			overlapY := math.Max(0, math.Min(rMaxY, other.Y+other.Length)-math.Max(rMinY, other.Y))
			if overlapX > 0.05 && overlapY > 0.05 {
				warnings = append(warnings, fmt.Sprintf("Room overlap detected between '%s' and '%s'", rm.Name, other.Name))
			}
		}
	}

	boundW := maxX - minX
	boundH := maxY - minY
	grossBuiltUp := (boundW + 2*req.ExteriorWallThickness) * (boundH + 2*req.ExteriorWallThickness)

	efficiency := 0.0
	if grossBuiltUp > 0 {
		efficiency = math.Min(100.0, (totalCarpetSqm/grossBuiltUp)*100.0)
	}

	metrics := MultiRoomMetrics{
		TotalCarpetAreaSqm:   math.Round(totalCarpetSqm*100) / 100,
		TotalCarpetAreaSqft:  math.Round(totalCarpetSqm*10.7639*10) / 10,
		GrossBuiltUpAreaSqm:  math.Round(grossBuiltUp*100) / 100,
		GrossBuiltUpAreaSqft: math.Round(grossBuiltUp*10.7639*10) / 10,
		BoundingWidthM:       math.Round(boundW*100) / 100,
		BoundingHeightM:      math.Round(boundH*100) / 100,
		RoomCount:            len(req.Rooms),
		EfficiencyPercent:    math.Round(efficiency*10) / 10,
		Schedule:             schedule,
		Warnings:             warnings,
	}

	resp := MultiRoomValidationResponse{
		Status:    "success",
		Metrics:   metrics,
		FloorPlan: req,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func handlePresets(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)

	presets := []RoomConfig{
		{
			ID:            "single-mb",
			Name:          "Master Bedroom Suite",
			Type:          "bedroom",
			Breadth:       5.5,
			Length:        4.5,
			WallThickness: 0.20,
			Openings: []Opening{
				{ID: "mb-d1", Type: "door", Wall: "S", Position: 0.8, Width: 0.9, FlipHinge: false, FlipSwing: false},
				{ID: "mb-w1", Type: "window", Wall: "N", Position: 1.8, Width: 1.8},
				{ID: "mb-w2", Type: "window", Wall: "E", Position: 1.2, Width: 1.2},
			},
		},
		{
			ID:            "single-st",
			Name:          "Studio Living & Work",
			Type:          "living",
			Breadth:       6.5,
			Length:        5.0,
			WallThickness: 0.20,
			Openings: []Opening{
				{ID: "st-d1", Type: "door", Wall: "W", Position: 0.6, Width: 0.95, FlipHinge: true, FlipSwing: false},
				{ID: "st-w1", Type: "window", Wall: "E", Position: 1.0, Width: 2.2},
				{ID: "st-w2", Type: "window", Wall: "N", Position: 2.0, Width: 1.6},
			},
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(presets)
}

func handleMultiRoomPresets(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)

	multiPresets := []MultiRoomConfig{
		{
			Name:                  "1-BHK Urban Residence",
			ExteriorWallThickness: 0.20,
			InteriorWallThickness: 0.10,
			Rooms: []RoomConfig{
				{
					ID:      "1bhk-living",
					Name:    "Living & Dining",
					Type:    "living",
					X:       0.0,
					Y:       0.0,
					Breadth: 5.0,
					Length:  4.5,
					Openings: []Opening{
						{ID: "1bhk-main-door", Type: "door", Wall: "W", Position: 0.6, Width: 1.0, FlipHinge: false, FlipSwing: false},
						{ID: "1bhk-liv-w1", Type: "window", Wall: "N", Position: 1.5, Width: 2.0},
						{ID: "1bhk-liv-bed-door", Type: "door", Wall: "E", Position: 1.0, Width: 0.9, FlipHinge: false, FlipSwing: true},
					},
				},
				{
					ID:      "1bhk-bed",
					Name:    "Master Bedroom",
					Type:    "bedroom",
					X:       5.0,
					Y:       0.0,
					Breadth: 4.0,
					Length:  3.5,
					Openings: []Opening{
						{ID: "1bhk-bed-w1", Type: "window", Wall: "N", Position: 1.0, Width: 1.8},
						{ID: "1bhk-bed-w2", Type: "window", Wall: "E", Position: 1.0, Width: 1.4},
					},
				},
				{
					ID:      "1bhk-kitchen",
					Name:    "Kitchen",
					Type:    "kitchen",
					X:       0.0,
					Y:       4.5,
					Breadth: 3.0,
					Length:  2.5,
					Openings: []Opening{
						{ID: "1bhk-k-d1", Type: "door", Wall: "N", Position: 0.6, Width: 0.85, FlipHinge: false, FlipSwing: true},
						{ID: "1bhk-k-w1", Type: "window", Wall: "S", Position: 0.8, Width: 1.4},
					},
				},
				{
					ID:      "1bhk-bath",
					Name:    "Bathroom",
					Type:    "bathroom",
					X:       3.0,
					Y:       4.5,
					Breadth: 2.0,
					Length:  2.5,
					Openings: []Opening{
						{ID: "1bhk-b-d1", Type: "door", Wall: "N", Position: 0.5, Width: 0.75, FlipHinge: false, FlipSwing: true},
						{ID: "1bhk-b-w1", Type: "window", Wall: "S", Position: 0.6, Width: 0.8},
					},
				},
				{
					ID:      "1bhk-foyer",
					Name:    "Hallway & Balcony",
					Type:    "balcony",
					X:       5.0,
					Y:       3.5,
					Breadth: 4.0,
					Length:  2.0,
					Openings: []Opening{
						{ID: "1bhk-f-w1", Type: "window", Wall: "E", Position: 0.5, Width: 2.5},
					},
				},
			},
		},
		{
			Name:                  "2-BHK Contemporary Apartment",
			ExteriorWallThickness: 0.20,
			InteriorWallThickness: 0.10,
			Rooms: []RoomConfig{
				{
					ID:      "2bhk-living",
					Name:    "Living & Dining Room",
					Type:    "living",
					X:       0.0,
					Y:       0.0,
					Breadth: 6.0,
					Length:  4.5,
					Openings: []Opening{
						{ID: "2bhk-main", Type: "door", Wall: "W", Position: 0.6, Width: 1.0, FlipHinge: false, FlipSwing: false},
						{ID: "2bhk-liv-w", Type: "window", Wall: "N", Position: 1.5, Width: 2.4},
						{ID: "2bhk-d-mb", Type: "door", Wall: "E", Position: 0.8, Width: 0.9, FlipHinge: false, FlipSwing: true},
					},
				},
				{
					ID:      "2bhk-master",
					Name:    "Master Suite",
					Type:    "bedroom",
					X:       6.0,
					Y:       0.0,
					Breadth: 4.5,
					Length:  4.0,
					Openings: []Opening{
						{ID: "2bhk-mb-w", Type: "window", Wall: "N", Position: 1.2, Width: 2.0},
						{ID: "2bhk-d-ensuite", Type: "door", Wall: "S", Position: 0.6, Width: 0.8, FlipHinge: false, FlipSwing: true},
					},
				},
				{
					ID:      "2bhk-ensuite",
					Name:    "En-Suite Bath",
					Type:    "bathroom",
					X:       6.0,
					Y:       4.0,
					Breadth: 2.2,
					Length:  2.2,
					Openings: []Opening{
						{ID: "2bhk-es-w", Type: "window", Wall: "S", Position: 0.5, Width: 0.8},
					},
				},
				{
					ID:      "2bhk-bed2",
					Name:    "Guest Bedroom",
					Type:    "bedroom",
					X:       3.5,
					Y:       4.5,
					Breadth: 3.5,
					Length:  3.5,
					Openings: []Opening{
						{ID: "2bhk-b2-d", Type: "door", Wall: "N", Position: 0.6, Width: 0.9, FlipHinge: false, FlipSwing: true},
						{ID: "2bhk-b2-w", Type: "window", Wall: "S", Position: 1.0, Width: 1.6},
					},
				},
				{
					ID:      "2bhk-kitchen",
					Name:    "Kitchen & Utility",
					Type:    "kitchen",
					X:       0.0,
					Y:       4.5,
					Breadth: 3.5,
					Length:  3.0,
					Openings: []Opening{
						{ID: "2bhk-k-d", Type: "door", Wall: "N", Position: 0.6, Width: 0.85, FlipHinge: false, FlipSwing: true},
						{ID: "2bhk-k-w", Type: "window", Wall: "W", Position: 0.8, Width: 1.4},
					},
				},
				{
					ID:      "2bhk-bath2",
					Name:    "Common Restroom",
					Type:    "bathroom",
					X:       7.0,
					Y:       4.5,
					Breadth: 2.0,
					Length:  2.5,
					Openings: []Opening{
						{ID: "2bhk-b2-d2", Type: "door", Wall: "W", Position: 0.5, Width: 0.75, FlipHinge: false, FlipSwing: true},
						{ID: "2bhk-b2-w2", Type: "window", Wall: "E", Position: 0.6, Width: 0.8},
					},
				},
			},
		},
		{
			Name:                  "Studio Apartment",
			ExteriorWallThickness: 0.20,
			InteriorWallThickness: 0.10,
			Rooms: []RoomConfig{
				{
					ID:      "std-main",
					Name:    "Studio Living & Sleeping",
					Type:    "living",
					X:       0.0,
					Y:       0.0,
					Breadth: 6.0,
					Length:  4.2,
					Openings: []Opening{
						{ID: "std-entry", Type: "door", Wall: "W", Position: 0.6, Width: 0.95, FlipHinge: false, FlipSwing: false},
						{ID: "std-w1", Type: "window", Wall: "N", Position: 1.5, Width: 2.2},
						{ID: "std-w2", Type: "window", Wall: "E", Position: 1.2, Width: 1.6},
					},
				},
				{
					ID:      "std-kitchen",
					Name:    "Kitchenette",
					Type:    "kitchen",
					X:       0.0,
					Y:       4.2,
					Breadth: 3.5,
					Length:  2.2,
					Openings: []Opening{
						{ID: "std-k-w", Type: "window", Wall: "S", Position: 1.0, Width: 1.4},
					},
				},
				{
					ID:      "std-bath",
					Name:    "Bathroom",
					Type:    "bathroom",
					X:       3.5,
					Y:       4.2,
					Breadth: 2.5,
					Length:  2.2,
					Openings: []Opening{
						{ID: "std-b-d", Type: "door", Wall: "N", Position: 0.6, Width: 0.75, FlipHinge: false, FlipSwing: true},
						{ID: "std-b-w", Type: "window", Wall: "S", Position: 0.8, Width: 0.8},
					},
				},
			},
		},
		{
			Name:                  "Executive Office Suite",
			ExteriorWallThickness: 0.25,
			InteriorWallThickness: 0.10,
			Rooms: []RoomConfig{
				{
					ID:      "off-rec",
					Name:    "Reception & Lobby",
					Type:    "office",
					X:       0.0,
					Y:       0.0,
					Breadth: 5.0,
					Length:  4.0,
					Openings: []Opening{
						{ID: "off-main-d", Type: "door", Wall: "W", Position: 0.8, Width: 1.2, FlipHinge: false, FlipSwing: false},
						{ID: "off-rec-w", Type: "window", Wall: "N", Position: 1.5, Width: 2.0},
					},
				},
				{
					ID:      "off-conf",
					Name:    "Conference Room",
					Type:    "office",
					X:       5.0,
					Y:       0.0,
					Breadth: 5.5,
					Length:  4.0,
					Openings: []Opening{
						{ID: "off-conf-d", Type: "door", Wall: "W", Position: 0.8, Width: 0.95, FlipHinge: false, FlipSwing: true},
						{ID: "off-conf-w", Type: "window", Wall: "N", Position: 1.5, Width: 2.4},
						{ID: "off-conf-w2", Type: "window", Wall: "E", Position: 1.0, Width: 1.8},
					},
				},
				{
					ID:      "off-exec",
					Name:    "Executive Cabin",
					Type:    "office",
					X:       0.0,
					Y:       4.0,
					Breadth: 4.5,
					Length:  3.5,
					Openings: []Opening{
						{ID: "off-exec-d", Type: "door", Wall: "N", Position: 0.6, Width: 0.9, FlipHinge: false, FlipSwing: true},
						{ID: "off-exec-w", Type: "window", Wall: "W", Position: 1.0, Width: 1.8},
					},
				},
				{
					ID:      "off-open",
					Name:    "Open Workstation Floor",
					Type:    "office",
					X:       4.5,
					Y:       4.0,
					Breadth: 6.0,
					Length:  4.8,
					Openings: []Opening{
						{ID: "off-work-w1", Type: "window", Wall: "E", Position: 1.5, Width: 2.6},
						{ID: "off-work-w2", Type: "window", Wall: "S", Position: 1.8, Width: 2.4},
					},
				},
				{
					ID:      "off-bath",
					Name:    "Restroom",
					Type:    "bathroom",
					X:       0.0,
					Y:       7.5,
					Breadth: 2.5,
					Length:  2.0,
					Openings: []Opening{
						{ID: "off-bath-d", Type: "door", Wall: "N", Position: 0.5, Width: 0.75, FlipHinge: false, FlipSwing: true},
					},
				},
			},
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(multiPresets)
}

func main() {
	http.HandleFunc("/api/validate", handleValidate)
	http.HandleFunc("/api/validate-multi-room", handleValidateMultiRoom)
	http.HandleFunc("/api/presets", handlePresets)
	http.HandleFunc("/api/multi-room-presets", handleMultiRoomPresets)

	log.Println("Architectural 2D Multi-Room Backend running on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
