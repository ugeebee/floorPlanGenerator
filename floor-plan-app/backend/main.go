package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
)

type Opening struct {
	ID        string  `json:"id"`
	Type      string  `json:"type"`      // "door" or "window"
	Wall      string  `json:"wall"`      // "N", "S", "E", "W"
	Position  float64 `json:"position"`  // distance in meters from wall start
	Width     float64 `json:"width"`     // width in meters
	FlipHinge bool    `json:"flipHinge"` // hinge side
	FlipSwing bool    `json:"flipSwing"` // swing direction
}

type RoomConfig struct {
	Name          string    `json:"name"`
	Length        float64   `json:"length"`
	Breadth       float64   `json:"breadth"`
	WallThickness float64   `json:"wallThickness"`
	Openings      []Opening `json:"openings"`
}

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

	// Compute metrics
	grossArea := req.Breadth * req.Length
	grossAreaSqft := grossArea * 10.7639
	perimeter := 2 * (req.Breadth + req.Length)

	var totalWindowArea float64
	var warnings []string

	// Group openings by wall to detect collisions
	wallOpenings := make(map[string][]Opening)
	for _, op := range req.Openings {
		wallOpenings[op.Wall] = append(wallOpenings[op.Wall], op)
		if op.Type == "window" {
			// Standard architectural window height estimate: 1.4m
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

		// Sort openings by position
		sort.Slice(ops, func(i, j int) bool {
			return ops[i].Position < ops[j].Position
		})

		for i, op := range ops {
			// Check if opening exceeds wall length
			if op.Position+op.Width > wallLen {
				warnings = append(warnings, fmt.Sprintf("Opening %s on Wall %s exceeds wall length (%.2fm > %.2fm)", op.ID, wall, op.Position+op.Width, wallLen))
			}
			// Check corner clearances
			if op.Position < 0.1 {
				warnings = append(warnings, fmt.Sprintf("Opening %s on Wall %s is too close to the corner (< 0.10m)", op.ID, wall))
			}
			if op.Position+op.Width > wallLen-0.1 {
				warnings = append(warnings, fmt.Sprintf("Opening %s on Wall %s is too close to the far corner (< 0.10m)", op.ID, wall))
			}
			// Check overlap with next opening
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

func handlePresets(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)

	presets := []RoomConfig{
		{
			Name:          "Master Bedroom Suite",
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
			Name:          "Studio Living & Work",
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

func main() {
	http.HandleFunc("/api/validate", handleValidate)
	http.HandleFunc("/api/presets", handlePresets)

	log.Println("Architectural 2D Backend running on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
