ECOSTEP AI is an innovative smart flooring system that converts human footsteps into electrical energy using piezoelectric technology. The system combines energy harvesting, footstep detection, real-time monitoring, IoT connectivity, and AI-based analytics.

🚀 Key Features
⚡ Harvests electrical energy from human footsteps
🔋 Stores harvested energy in a 3.7 V rechargeable battery
👣 Detects and counts footsteps using micro limit switches
📊 Measures voltage, current, power, and energy
🧠 AI-based energy prediction and tile-health monitoring
📡 ESP32-based Wi-Fi connectivity
📈 Real-time monitoring dashboard
🧩 Modular tile architecture for easy expansion
🏢 Designed for high-footfall environments
🔬 Experimental Result

During prototype testing, Tile 1 produced a maximum measured voltage of approximately 1.5 V under the tested conditions. This result demonstrates measurable electrical generation from footsteps and forms the basis for further optimization of the energy-harvesting circuit.

⚙️ System Architecture
Human Footstep
      ↓
Piezoelectric Discs
      ↓
Bridge Rectifier
      ↓
Energy Management / Charging Circuit
      ↓
3.7 V Rechargeable Battery
      ↓
Boost Converter
      ↓
USB Output

          ┌──────────────────┐
          │      ESP32       │
          └────────┬─────────┘
                   ↓
      Footstep + Energy Monitoring
                   ↓
             IoT Dashboard
🧩 Hardware Components
ESP32 DevKit V1
Piezoelectric discs
Micro limit switches
Bridge rectifiers
INA219 current/voltage sensor
Instrumentation amplifier for signal measurement
3.7 V rechargeable battery
MT3608 boost converter
Polycarbonate top plates
Compression springs
Aluminium profile frame
Anti-slip rubber surface
🌱 Real-World Applications

ECOSTEP AI can be adapted for high-footfall locations such as:

Railway and metro stations
Shopping malls
Schools and colleges
Airports
Smart buildings
Public walkways
Stadiums and event venues
💡 Innovation

ECOSTEP AI transforms ordinary human movement into measurable electrical energy while simultaneously turning the floor into a smart sensing platform. Its modular architecture allows individual tiles to be monitored, maintained, and expanded according to the installation requirements.

📌 Future Scope
Increase energy-harvesting efficiency
Improve battery-charging efficiency
Deploy larger numbers of tiles
Develop advanced AI-based predictive maintenance
Optimize mechanical compression mechanisms
Integrate cloud-based analytics
Develop large-scale smart-floor installations
