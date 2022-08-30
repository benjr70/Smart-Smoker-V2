
#define     THERMISTOR_PIN0     0      // Pin between the thermistor and 
                                      // series resistor.

#define     THERMISTOR_PIN1     1      // Pin between the thermistor and 
                                      // series resistor.

#define     SERIES_RESISTOR    10000  // Series resistor value in ohms.

#define     USE_FAHRENHEIT     true   // True to use Fahrenheit, false to
                                      // use celsius.

#define     ADC_SAMPLES        5      // Number of ADC samples to average
                                      // when taking a reading.

// Temperature unit conversion functions and state.
typedef float (*TempConversion)(float);
TempConversion ToKelvin; 
TempConversion FromKelvin;
char* TempUnit;

// manual set Coefficiets
float A = 0.000363993930;
float B = 0.000262156391;
float C = -0.000000024874;




  
void setup() {
  Serial.begin(9600);
  analogReference(DEFAULT);
}

void loop() {
   
  Serial.print("{\"Meat\": \"");
  Serial.print(kelvinToFahrenheit(readTemp(THERMISTOR_PIN0)));
  Serial.print("\",");
   Serial.print("\"Chamber\": \"");
  Serial.print(kelvinToFahrenheit(readTemp(THERMISTOR_PIN1)));
  Serial.println("\"}");
  delay(500);

}

float kelvinToFahrenheit(float kelvin) {
  return kelvin*(9.0/5.0) - 459.67;
}


double readResistance(int pin) {
  float reading = 0;
  for (int i = 0; i < ADC_SAMPLES; ++i) {
    reading += analogRead(pin);
  }
  reading /= (float)ADC_SAMPLES;
  reading = (1023 / reading) - 1;
  return SERIES_RESISTOR / reading;
}

float readTemp(int pin) {
  float R = readResistance(pin);
  float kelvin = 1.0/(A + B*log(R) + C*pow(log(R), 3.0));
  return kelvin;
}
