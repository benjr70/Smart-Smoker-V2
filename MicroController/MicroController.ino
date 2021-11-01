
#define TC_PIN0 A0          // set to ADC pin used 0
#define TC_PIN1 A1          // set to ADC pin used 0
#define AREF 5.0           // set to AREF, typically board voltage like 3.3 or 5.0
#define ADC_RESOLUTION 10  // set to ADC bit resolution, 10 is default

float reading0, reading1, voltage0, voltage1, temperature0, temperature1;

float get_voltage(int raw_adc) {
  return raw_adc * (AREF / (pow(2, ADC_RESOLUTION)-1));  
}

float get_temperature(float voltage) {
  return (voltage - 1.25) / 0.005;
}

void setup() {
  Serial.begin(9600);
}

void loop() {
  reading0 = analogRead(TC_PIN0);
  voltage0 = get_voltage(reading0);
  temperature0 = get_temperature(voltage0);
  Serial.print("{\"Meat\": \"");
  Serial.print(temperature0);
  Serial.print("\",");
  
  reading1 = analogRead(TC_PIN1);
  voltage1 = get_voltage(reading1);
  temperature1 = get_temperature(voltage1);
  Serial.print("\"Chamber\": \"");
  Serial.print(temperature1);
  Serial.println("\"}");
  delay(500);
}
